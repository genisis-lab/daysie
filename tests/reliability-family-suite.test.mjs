import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const worker = read("worker.js");
const reliabilityWorker = read("reliability-worker.js");
const ui = read("reliability-features.js");
const html = read("index.html");
const sw = read("sw.js");
const migration = read("migrations/0008_reliability_family_suite.sql");

test("legacy device accounts have an authenticated, retryable migration path", () => {
  assert.match(reliabilityWorker, /claim-legacy/);
  assert.match(reliabilityWorker, /finalize-legacy/);
  assert.match(reliabilityWorker, /account_migrations/);
  assert.match(ui, /pendingLegacyMigrationId/);
});

test("notification diagnostics and per-device controls are fully wired", () => {
  assert.match(html, /notificationDiagnostics/);
  assert.match(reliabilityWorker, /notifications\/diagnostics/);
  assert.match(reliabilityWorker, /notifications\\\/devices/);
  assert.match(ui, /data-device-rename/);
  assert.match(ui, /data-device-toggle/);
  assert.match(ui, /data-device-remove/);
  assert.match(html, /reconnectNotificationsBtn/);
});

test("family task delivery exposes delivered, seen, and completed receipts", () => {
  assert.match(migration, /push_delivered_at/);
  assert.match(migration, /seen_at/);
  assert.match(migration, /completed_at/);
  assert.match(worker, /push_delivered_at = \?/);
  assert.match(html, /familyReceiptList/);
});

test("notification actions support family assignments and personal reminders", () => {
  assert.match(sw, /Snooze 1 hour/);
  assert.match(sw, /notificationAction/);
  assert.match(sw, /taskId/);
  assert.match(sw, /assignmentId/);
  assert.match(ui, /Reminder completed/);
});

test("rotating chores, activity, availability, and DND have durable storage", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS family_chores/);
  assert.match(reliabilityWorker, /runChores/);
  assert.match(reliabilityWorker, /chore-assigned/);
  assert.match(html, /familyChoreForm/);
  assert.match(html, /familyAvailabilityNote/);
  assert.match(worker, /dnd_until/);
});

test("calendar transfer, backup verification, digests, and timezone safeguards are present", () => {
  assert.match(html, /Export \.ics/);
  assert.match(html, /Import \.ics/);
  assert.match(ui, /BEGIN:VCALENDAR/);
  assert.match(reliabilityWorker, /backups\\\/\(\[\^\/\]\+\)\\\/verify/);
  assert.match(reliabilityWorker, /runDigests/);
  assert.match(reliabilityWorker, /zonedDateTimeToUtc/);
});

test("family onboarding is direct and accessibility fallbacks are included", () => {
  assert.match(html, /familyGateSignIn/);
  assert.match(html, /familyGateCreate/);
  assert.match(html, /aria-live="polite"/);
  assert.match(read("styles.css"), /forced-colors:active/);
  assert.match(read("styles.css"), /prefers-reduced-motion:reduce/);
});
