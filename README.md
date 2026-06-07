# Daysie 🌼

Daysie is a family-friendly reminders and journal web app built for simple Cloudflare Pages hosting.

## Features

- Reminder/task creation with date, time, notes, priority, and repeat options
- Browser notifications and in-app reminder alerts
- Snooze support for overdue tasks
- Cozy daily journal with mood tracking, prompts, and tags
- Streaks, weekly mood chart, small achievements, and data export
- Gentle animated Three.js background
- Local-first storage using `localStorage`

## Cloudflare Pages setup

1. In Cloudflare Pages, connect this GitHub repo: `genisis-lab/daysie`.
2. Framework preset: **None** or **Static HTML**.
3. Build command: leave blank.
4. Build output directory: `/`.
5. Deploy.

## Reminder note

Daysie can show browser notifications while the app is open. True always-on push reminders when the app is fully closed would require a backend/service worker push setup in a later version.
