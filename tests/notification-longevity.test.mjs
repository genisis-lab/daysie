import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const app = read("app.js");
const sw = read("sw.js");
const worker = read("worker.js");
const reliabilityWorker = read("reliability-worker.js");
const reliabilityFeatures = read("reliability-features.js");
const styles = read("styles.css");
const migration = read("migrations/0009_notification_ledger.sql");

test("server reminders use a delivery ledger instead of rewriting every account each minute", () => {
  assert.match(worker, /await runTaskReminders\(r, now, sendPush\)/);
  assert.doesNotMatch(worker, /SELECT user_id, data FROM user_data"\)\.all\(\)/);
  assert.match(reliabilityWorker, /AND revision = \? AND updated_at = \?/);
  assert.match(reliabilityWorker, /ON CONFLICT\(user_id, task_id, due_at\) DO UPDATE SET status = 'sending'/);
  assert.match(reliabilityWorker, /REMINDER_LOOKBACK = DAY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reminder_deliveries/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS push_expired_endpoints/);
});

test("expired or rotated push connections are replaced instead of silently re-registered", () => {
  assert.match(worker, /rememberExpiredEndpoint\(env, \{ endpoint: row\.endpoint/);
  assert.match(worker, /expired: true \}, 410, m\)/);
  assert.match(worker, /"\/push\/resubscribe" === p/);
  assert.match(sw, /addEventListener\("pushsubscriptionchange"/);
  assert.match(sw, /\/push\/resubscribe/);
  assert.match(app, /response\.status === 410 && !fresh\) return registerPushSubscription\(\{ fresh: !0 \}\)/);
  assert.match(app, /usesCurrentPushKey\(subscription\)/);
});

test("the push connection is re-checked when a long-lived PWA returns to the foreground", () => {
  assert.match(app, /PUSH_REFRESH_INTERVAL = 6 \* 60 \* 60 \* 1000/);
  assert.match(app, /document\.addEventListener\("visibilitychange", \(\) => \{\n  if \(document\.hidden\) return;\n  showNotifyBanner\(\);\n  refreshPushSubscription\(\);/);
  assert.match(app, /type === "push-subscription-changed"/);
});

test("in-app reminders use the service worker and batch reminders missed while closed", () => {
  assert.match(app, /swRegistration\s*\.showNotification\(/);
  assert.match(app, /const MISSED_REMINDER_WINDOW = 5 \* 60 \* 1000/);
  assert.match(app, /reminders came due while Daysie was closed/);
  assert.doesNotMatch(app, /o % 5 == 0/);
  assert.match(app, /renagLastAlert/);
});

test("sync survives session renewal and keeps the newest task edit across devices", () => {
  assert.match(app, /daysieAuthenticatedFetch\(`\$\{API\}\/data`, \{\n        method: "POST"/);
  assert.doesNotMatch(app, /fetch\("https:\/\/daysie-api\.neil27\.workers\.dev\/data"/);
  assert.match(app, /stampChangedTasks\(\);/);
  assert.match(app, /const \{ updatedAt, notified, \.\.\.rest \} = task;/);
  assert.match(app, /dropDeletedTasks\(mergeRecords\(left\.tasks, right\.tasks\), trash\)/);
});

test("notification actions keep repeating reminders alive", () => {
  assert.match(reliabilityFeatures, /if \(!task\.done\) completeTask\(task\);/);
  assert.doesNotMatch(reliabilityFeatures, /task\.done = true;/);
  assert.match(app, /for \(let skipped = 0; t <= Date\.now\(\) && skipped < 1000; skipped\+\+\)/);
});

test("the service worker does not grow its cache with one-off URLs", () => {
  assert.match(sw, /return url\.search \? null : req;/);
  assert.match(sw, /type: "notification-click"/);
  assert.doesNotMatch(sw, /\.navigate\(/);
  assert.match(reliabilityFeatures, /event\.data\?\.type !== "notification-click"/);
});

test("dark and high-contrast themes recolour page text", () => {
  assert.match(styles, /body\{margin:0;min-height:100vh;color:var\(--ink\);/);
  assert.match(styles, /body\[data-theme=hc\]\{--bg: #fff;--bg2: #fff;/);
});
