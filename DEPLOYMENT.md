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

Copy the `database_id` from the output and paste it into `wrangler.toml` (replace `YOUR_D1_DATABASE_ID`).

### Step 3: Run Database Schema

```bash
wrangler d1 execute daysie-db --file=schema.sql
```

For an existing deployment, apply the incremental migration instead of resetting
tables:

```bash
wrangler d1 execute daysie-db --file=migrations/0001_security_hardening.sql
```

### Step 4: Generate VAPID Keys (for Web Push)

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

### Step 5: Update app.js with Your Worker URL

In `app.js`, replace **all instances** of:

```javascript
https://daysie-api.YOUR_SUBDOMAIN.workers.dev
```

with your actual Worker URL (you'll get this after deploying).

Also replace `YOUR_VAPID_PUBLIC_KEY` in the `subscribePushBtn` onclick handler with your actual VAPID public key.

### Step 6: Deploy Worker

```bash
wrangler deploy
```

You'll get a URL like `https://daysie-api.YOUR-SUBDOMAIN.workers.dev`. Copy this URL.

### Step 7: Update Frontend with Worker URL

1. Edit `app.js` locally
2. Replace all `https://daysie-api.YOUR_SUBDOMAIN.workers.dev` with your actual Worker URL
3. Replace `YOUR_VAPID_PUBLIC_KEY` with your actual VAPID public key
4. Push the updated `app.js` to GitHub
5. Cloudflare Pages will auto-deploy the update

### Step 8: Set Up Cron Trigger

The `wrangler.toml` already includes a cron trigger (`* * * * *` = every minute). This will check for due reminders and send push notifications even when the app is closed.

## Testing

1. Open your Daysie site
2. Go to Settings (⚙️)
3. Click "Turn on sync" to create an account on this device
4. On a second device, open Daysie → Settings → "I have a code"
5. On the first device tap "Link another device", enter that code on the second device, then approve the prompt on the first device
6. Create a task with a near-future reminder
7. Enable push notifications when prompted
8. Close the app and wait for the reminder time
9. You should receive a push notification!

## Device Pairing (how sign-in works)

Daysie uses device pairing instead of email. The first device calls `/account/create` to make an account. To add another device, the signed-in device generates a short code (`/pair/create`); the new device submits it (`/pair/redeem`) and waits while the original device approves the request (`/pair/approve`). Codes are single-use, expire in ~3 minutes, are limited to one active code per account, and redeem attempts are rate-limited per IP. No email provider or domain is required.

## Monitoring

View Worker logs:

```bash
wrangler tail
```

View D1 data:

```bash
wrangler d1 execute daysie-db --command="SELECT * FROM users"
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
