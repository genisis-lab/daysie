# 🌼 Daysie

**Your gentle family helper for reminders, reflections, and growing one day at a time.**

Daysie is a beautiful, accessible reminder and journal app designed for **people of all ages**. From Grandma's medicine reminders to the kids' homework tasks, everyone can use Daysie with ease.

## ✨ Features

### 📱 **Works Everywhere**
- **Installable PWA** — Add to your home screen like a native app
- **Offline-first** — Works without internet (Service Worker caching)
- **Responsive design** — Perfect on phones, tablets, and desktops
- **Mobile-optimized** — Large touch targets, readable fonts, no zoom issues

### 👨‍👩‍👧 **Family Profiles**
- **Color-coded profiles** for each family member
- Each person has their own tasks, journal, and streak
- Switch profiles with one tap
- Custom emoji and color for each profile

### ⏰ **Smart Reminders**
- **Default to today** — New tasks automatically set to same-day
- **Categories** — Medicine 💊, Chores 🧹, Birthdays 🎂, Calls 📞, Appointments 🩺
- **Priority levels** — Easy, Normal, Important (high-priority tasks re-nag until done!)
- **Repeat options** — Once, Daily, Weekly, Monthly, **Yearly** (perfect for birthdays/anniversaries)
- **Snooze** — Push a reminder back 10 minutes
- **Multi-device push notifications** — Closed-app reminders reach every connected device, with delivery diagnostics and a built-in test
- **Notification preferences** — Choose in-app tones, supported vibration patterns, quiet hours, and alert categories
- **Notification reliability center** — Separate permission, install, account, push-service, device, and last-delivery checks
- **Per-device controls** — Rename, pause, resume, or remove individual notification devices
- **Action buttons and digests** — Complete or snooze supported notifications and opt into morning, evening, or weekly summaries
- **PWA badges** — Supported devices show a badge for new reminders and clear it when Daysie is opened
- **Re-nag alerts** — Overdue important tasks re-alert every 5 minutes (TickTick-style)

> **iPhone and iPad note:** Apple controls the sound and vibration used by background web push notifications. Daysie's custom tones play while the PWA is open; custom vibration strengths are requested only on browsers that support the Vibration API.

### 📅 **Calendar & Planning**
- **Month view** — See all your tasks in a beautiful calendar grid
- **This week agenda** — Quick overview of upcoming tasks
- **Day detail** — Tap any calendar day to see that day's tasks

### 📖 **Cozy Journal**
- **Mood tracking** — 5 moods with friendly emojis
- **Daily prompts** — Gentle questions to inspire reflection
- **Tags** — Family, Friends, Work, Health, Gratitude, and more
- **Photo attachments** — Add photos to your entries
- **Edit entries** — Update old entries anytime
- **Confirm-before-delete** — No accidental deletions
- **"On this day" memories** — See journal entries from past years on the same date
- **Search** — Find entries by text or tags
- **Export to PDF** — Download your journal as a PDF

### 🌈 **Insights & Streaks**
- **Daily streak** — How many days in a row you've checked in
- **Mood chart** — See your week's emotional journey
- **Badges** — Unlock achievements as you grow
- **Stats** — Tasks done, entries written, current to-dos

### ♿ **Accessibility & Themes**
- **Light mode** — Warm, gentle colors (default)
- **Dark mode** — Easy on the eyes at night
- **High contrast** — For users with vision needs
- **Font sizes** — Normal, Large, Extra Large (perfect for older users)
- **Keyboard-friendly** — Full keyboard navigation
- **Screen reader ready** — ARIA labels throughout

### ☁️ **Sync Across Devices** (Optional)
- **Secure accounts** — Create an account with a name, unique username, email, and password; sign in with email or username
- **Bot protection** — Cloudflare Turnstile protects sign-up and sign-in
- **Two-step verification** — Authenticator-app codes, trusted devices, backup codes, and lockout protection
- **Passkey management** — Add, rename, review, and remove Face ID, Touch ID, and device-PIN passkeys
- **Sync history** — Automatic cross-device merging plus 20 restorable cloud versions
- **Device pairing** — Link another device with a short code and an approve tap
- **Family invitations** — Invite by email, short code, QR code, or the native share sheet with configurable expiration
- **Cloud sync** — Your data syncs across all your devices (powered by Cloudflare D1)
- **Real push notifications** — Get reminders even when the app is closed (when deployed with Cloudflare Worker)
- **Privacy-first** — Synced data is access-controlled and scoped to your account; optional backup history is encrypted on your device before upload
- **Safe account migration** — Existing local/device-code accounts move their notification, family, and sync history into Better Auth after sign-in
- **Recovery-tested backups** — Verify the cloud envelope and decrypt a backup locally without replacing current data
- **Works offline** — Local-first design means the app works without an account or internet

### 🏡 **Household Planning**
- **Family dashboard and calendar** — See availability, upcoming events, assignments, and shared-list progress
- **Task discussions** — Add family comments and quick reactions without introducing family roles
- **Delivery receipts** — See whether an assigned family task reached the inbox/push service, was seen, or was completed
- **Rotating chores** — Schedule daily, weekday, weekly, biweekly, or monthly chores across selected family members
- **Shared availability &amp; DND** — Add a status note, an end time, and optionally pause family nudges
- **Calendar transfer** — Import or export shared family events using standard `.ics` files
- **Natural-language quick add** — Preview dates, assignees, importance, weekdays, and every-two-week schedules
- **Smart grocery lists** — Parse quantity, unit, category, estimated price, and store from one line
- **Reusable routines** — Save household checklists and turn them into scheduled reminders
- **Search everything** — Find tasks, journal entries, lists, routines, and family events with <kbd>Ctrl/⌘ K</kbd>
- **Recently deleted** — Restore tasks, entries, and lists for 30 days with immediate Undo
- **Safer imports** — Preview, merge, or replace a JSON backup before applying it
- **Storage dashboard** — Review local data, photos, backups, sync history, and family records

## 🚀 Quick Start

### Use It Now (No Setup)

Daysie is already live! Just visit your Cloudflare Pages URL and start using it.

- **No account required** — Works locally in your browser
- **No installation needed** — Just bookmark it or add to home screen
- **100% private** — All data stays on your device (unless you sign in for sync)

### Add to Home Screen (iOS/Android)

**iPhone/iPad:**
1. Open Daysie in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. Enjoy the app icon on your home screen!

**Android:**
1. Open Daysie in Chrome
2. Tap the menu (⋮)
3. Tap "Add to Home screen"
4. The app icon appears on your home screen!

## 🔧 Advanced: Cloud Sync & Push Setup

Want sync across devices and real push notifications? See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full Cloudflare Worker setup guide.

**What you'll get:**
- Sync between Grandma's phone and your laptop
- Push notifications even when the app is closed
- Email/password sign-in plus code-based device pairing with approve-on-source-device

**Requirements:**
- Cloudflare account (free tier works)
- 15 minutes to deploy the Worker

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, CSS3, HTML5
- **Graphics:** Three.js (floating orb background)
- **Storage:** LocalStorage (offline-first) + Cloudflare D1 (optional sync)
- **Backend:** Cloudflare Workers (optional, for sync + push)
- **PWA:** Service Worker, Web App Manifest
- **Auth:** Better Auth email/password sessions plus backwards-compatible device pairing codes
- **Abuse protection:** Cloudflare Turnstile with server-enforced verification
- **Push:** Web Push API + VAPID
- **Hosting:** Cloudflare Pages

## 📂 Project Structure

```
daysie/
├── index.html          # Main app HTML
├── styles.css          # All styles (light/dark/high-contrast themes)
├── app.js              # App logic (tasks, journal, profiles, sync)
├── power-features.js   # Search, routines, trash, family dashboard, security UI
├── reliability-features.js # Notification, receipt, chore, backup, and calendar UI
├── sw.js               # Service Worker (offline cache + push listener)
├── favicon.svg         # Daisy icon
├── site.webmanifest    # PWA manifest
├── worker.js           # Cloudflare Worker (auth + sync + scheduled push)
├── power-worker.js     # Focused account, history, family, storage, and metrics API
├── reliability-worker.js # Durable migration, receipts, device controls, chores, and digests
├── schema.sql          # D1 database schema
├── wrangler.toml       # Worker configuration
├── DEPLOYMENT.md       # Cloud setup guide
└── README.md           # This file
```

## 🎨 Design Philosophy

**For Everyone, Especially Grandma**

Daysie was designed with **accessibility and simplicity** in mind:

- **Large, friendly buttons** — Easy to tap, even with shaky hands
- **Clear labels** — No confusing icons or jargon
- **Gentle colors** — Warm, calming palette inspired by daisies and sunlight
- **No clutter** — One thing at a time, clean layouts
- **Forgiving** — Confirm before deleting, easy to undo, no data loss
- **Encouraging** — Positive language, celebration of small wins

## 🌱 The Daisy Metaphor

> "Just like a daisy grows petal by petal, we grow day by day."

Daysies bloom every day, one petal at a time. This app helps you:
- **Remember** the little things (reminders)
- **Reflect** on your day (journal)
- **Grow** your streak and build habits (insights)

No pressure, no stress — just gentle growth. 🌼

## 📝 License

MIT License - Feel free to use, modify, and share!

## 🙏 Acknowledgments

- **Three.js** for the beautiful floating orb background
- **Cloudflare** for generous free tier (Pages, Workers, D1)
- Inspired by TickTick, Todoist, Daylio, and Day One

---

**Made with 💛 for families who want to stay organized and connected.**

Grow one day at a time. 🌼
