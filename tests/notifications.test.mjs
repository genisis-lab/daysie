import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const worker = read("worker.js");
const app = read("app.js");
const account = read("account-features.js");
const family = read("app3.js");
const serviceWorker = read("sw.js");
const html = read("index.html");
const migration = read("migrations/0007_notification_reliability.sql");

test("push subscriptions support multiple devices per user", () => {
  assert.match(migration, /endpoint TEXT NOT NULL UNIQUE/);
  assert.match(migration, /idx_push_subscriptions_user/);
  assert.match(worker, /SELECT id, subscription FROM push_subscriptions WHERE user_id = \?/);
  assert.match(worker, /async function sendPushToUser/);
  assert.doesNotMatch(worker, /INSERT OR REPLACE INTO push_subscriptions \(user_id/);
});

test("notification diagnostics include a real test push and per-device delivery state", () => {
  assert.match(worker, /"\/push\/status"/);
  assert.match(worker, /"\/push\/test"/);
  assert.match(worker, /last_success_at/);
  assert.match(account, /sendTestNotificationBtn/);
  assert.match(html, /id="notificationDeviceList"/);
});

test("expired PWA sessions recover or ask the user to sign in again", () => {
  assert.match(app, /function recoverDaysieSession/);
  assert.match(app, /credentials: "include"/);
  assert.match(app, /data\?\.session\?\.token/);
  assert.match(app, /function daysieAuthenticatedFetch/);
  assert.match(app, /response\.status !== 401/);
  assert.match(account, /Your session expired\. Sign in again/);
  assert.match(family, /familyApiFetch/);
  assert.match(worker, /legacyGrace = 14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(worker, /UPDATE sessions SET expires = \? WHERE token = \?/);
});

test("family assignments report push delivery separately from inbox delivery", () => {
  assert.match(worker, /return c\(\{ success: true, id: o, delivery \}/);
  assert.match(worker, /return delivery;/);
  assert.match(family, /result\.delivery\?\.sent > 0/);
  assert.match(family, /They will see it when they open the app/);
});

test("tone and vibration preferences use honest platform-aware fallbacks", () => {
  assert.match(html, /id="notificationTone"/);
  assert.match(html, /id="notificationVibration"/);
  assert.match(account, /iOS controls the background notification sound and vibration/);
  assert.match(app, /function playNotificationTone/);
  assert.match(app, /function vibrateReminder/);
  assert.match(serviceWorker, /options\.vibrate/);
  assert.match(serviceWorker, /options\.silent/);
  assert.doesNotMatch(serviceWorker, /options\.sound/);
});

test("push notifications update and clear supported PWA badges", () => {
  assert.match(serviceWorker, /navigator\.setAppBadge/);
  assert.match(serviceWorker, /navigator\.clearAppBadge/);
  assert.match(worker, /badgeCount: 1/);
});
