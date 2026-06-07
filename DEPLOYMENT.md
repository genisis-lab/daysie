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
3. Enter your email and click "Send magic link"
4. Check your email for the 6-digit code
5. Enter the code and sign in
6. Create a task with a near-future reminder
7. Enable push notifications when prompted
8. Close the app and wait for the reminder time
9. You should receive a push notification!

## Optional: Email Configuration

By default, the Worker uses MailChannels (free for Cloudflare Workers). If you need a custom domain for emails, update the `sendEmail` function in `worker.js`.

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

### Magic link code not received
- Check Worker logs for email errors
- MailChannels is free but may have rate limits

### Push notifications not working
- Ensure VAPID keys are set correctly
- Check browser console for errors
- Verify Service Worker is registered (DevTools > Application > Service Workers)

### Data not syncing
- Check that you're signed in (Settings should show your email)
- Click "Sync now" to force a sync
- Check Worker logs for errors
