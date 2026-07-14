# Daysie Deployment Guide

This guide walks you through deploying Daysie with full sync and push notification support.

## Frontend (Cloudflare Pages) - ALREADY DONE ✓

Your site is already live on Cloudflare Pages! The frontend is ready.

## Backend Setup (Cloudflare Workers + D1)

### Prerequisites

- Cloudflare account (free tier works!)
- Node.js installed
- Wrangler CLI: `npm install -g wrangler`

### Step 1: Login to Cloudflare

```bash
wrangler login
```

### Step 2: Create D1 Database

```bash
wrangler d1 create daysie-db
```

Copy the `database_id` from the output and use it for the `DB` binding in `wrangler.toml`.

### Step 3: Run Database Schema

```bash
wrangler d1 execute daysie-db --file=schema.sql
```

For an existing deployment, apply the incremental migration instead of resetting
tables:

```bash
wrangler d1 execute daysie-db --file=migrations/0001_security_hardening.sql
```

Then add Better Auth and email invitations:

```bash
npx wrangler d1 execute daysie-db --remote --file=migrations/0002_better_auth_and_email_invites.sql
```

### Step 4: Configure Better Auth and email

Generate and store a Better Auth secret:

```bash
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
```

Daysie uses Resend for password-reset and family-invitation emails. Create a
Resend API key, verify the sender domain, then add these Worker secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

- `EMAIL_FROM`: a verified sender such as `Daysie <hello@yourdomain.com>`
- `APP_URL`: the public frontend origin. This non-secret value is configured in
  `wrangler.toml` as `https://daysie.pages.dev`.

Never put API keys or sender credentials directly in `wrangler.toml` or commit
them to Git.

Email confirmation is intentionally disabled. Accounts receive a session as
soon as email/password sign-up succeeds.

### Turnstile protection

The sign-in and sign-up forms use the managed Turnstile widget registered for
`daysie.pages.dev`, `localhost`, and `127.0.0.1`. The public widget key is safe
to keep in `index.html`. The `daysie-api` Worker validates every submitted
token through the managed `turnstile-siteverify-daysie` Worker before invoking
Better Auth; direct requests without a valid token are rejected.

### Step 5: Generate VAPID Keys (for Web Push)

```bash
npx web-push generate-vapid-keys
```

Copy the keys and add them as secrets:

```bash
wrangler secret put VAPID_PUBLIC_KEY
# Paste the public key when prompted

wrangler secret put VAPID_PRIVATE_KEY
# Paste the private key when prompted
```

### Step 6: Update app.js with Your Worker URL

In `app.js`, replace **all instances** of:

```javascript
https://daysie-api.YOUR_SUBDOMAIN.workers.dev
```

with your actual Worker URL (you'll get this after deploying).

Also replace `YOUR_VAPID_PUBLIC_KEY` in the `subscribePushBtn` onclick handler with your actual VAPID public key.

### Step 7: Install dependencies and deploy the Worker

```bash
npm install
wrangler deploy
```

You'll get a URL like `https://daysie-api.YOUR-SUBDOMAIN.workers.dev`. Copy this URL.

### Step 8: Update Frontend with Worker URL

1. Edit `app.js` locally
2. Replace all `https://daysie-api.YOUR_SUBDOMAIN.workers.dev` with your actual Worker URL
3. Replace `YOUR_VAPID_PUBLIC_KEY` with your actual VAPID public key
4. Push the updated `app.js` to GitHub
5. Cloudflare Pages will auto-deploy the update

### Step 9: Set Up Cron Trigger

The `wrangler.toml` already includes a cron trigger (`* * * * *` = every minute). This will check for due reminders and send push notifications even when the app is closed.

## Testing

1. Open Daysie and go to Settings.
2. Create an account, sign out, then sign back in to verify the login flow.
3. Send a family invitation to an email you can open and follow its link.
4. Also create a shareable family code to verify the original code path.
5. On a second device, choose “I have a code,” enter a device code, and approve it on the first device.
6. Create a task with a near-future reminder and enable push notifications.

## Authentication and device pairing

Better Auth handles email/password users, password hashing, sessions, and password resets under `/api/auth/*`. Daysie sends the returned bearer session token with its existing sync APIs, so the PWA remains compatible with the separate Worker origin.

The original device-pairing flow remains available. A signed-in device generates a short code (`/pair/create`); the new device submits it (`/pair/redeem`) and waits while the original device approves (`/pair/approve`). Codes are single-use, expire in about three minutes, and redeem attempts are rate-limited per IP.

## Monitoring

View Worker logs:

```bash
wrangler tail
```

View Better Auth users in D1:

```bash
npx wrangler d1 execute daysie-db --remote --command='SELECT id, email, createdAt FROM "user"'
```

## Costs

- **Cloudflare Pages**: Free (unlimited bandwidth)
- **Cloudflare Workers**: Free tier includes 100,000 requests/day
- **D1**: Free tier includes 5GB storage + 5 million reads/day
- **Cron Triggers**: Free (included in Workers)

For a family app, you'll stay well within free tier limits! 🌼

## Troubleshooting

### "Network error" when signing in

- Check that the Worker URL in `app.js` matches your deployed Worker
- Check Worker logs: `wrangler tail`

### Pairing code not working

- Codes expire after ~3 minutes — generate a fresh one
- Make sure the new device's request was approved on the original device
- If you see "too many attempts", wait a minute (per-IP rate limit) and retry
- Check Worker logs: `wrangler tail`

### Push notifications not working

- Ensure VAPID keys are set correctly
- The Worker sends Web Push using the built-in WebCrypto API (no `web-push` package needed). For background push to work you MUST set the `VAPID_PRIVATE_KEY` secret and redeploy the Worker (`npx wrangler deploy`).
- Background push only fires for tasks with a due date/time. On iPhone, the user must add Daysie to the Home Screen and open it from there (iOS 16.4+).
- Check Worker logs for `Push send error` (`wrangler tail`).
- Check browser console for errors
- Verify Service Worker is registered (DevTools > Application > Service Workers)

## Shipping an update (so users load the new app)

The app shows a "new version is ready" refresh banner when the deployed version
differs from what a user has open. For that to trigger, bump the version on every
meaningful front-end deploy:

1. Edit `version.json` and change `"version"` (e.g. `2026.06.07-2`).
2. Set the matching `APP_VERSION` constant near the top of `app.js` to the same value.
3. Commit/push to GitHub — Cloudflare Pages auto-deploys.

The service worker is network-first for the app files, so a normal reload always
loads the freshest HTML/JS/CSS when online. Users no longer need to clear site
data to update, so the saved name/profile is preserved across updates.

If you changed `worker.js` or `schema.sql`, also redeploy the Worker:
`npx wrangler deploy` (and run any schema migration first).

### Data not syncing

- Check that sync is on (Settings should show "Sync is on")
- Click "Sync now" to force a sync
- Check Worker logs for errors
