import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const auth = read("auth.js");
const authClient = read("auth-client-entry.js");
const authUi = read("auth-ui.js");
const app = read("app.js");
const app2 = read("app2.js");
const power = read("power-features.js");
const powerWorker = read("power-worker.js");
const html = read("index.html");
const migration = read("migrations/0006_features_1_20.sql");

test("account flow includes Better Auth two-factor, passkey management, and lockout", () => {
  assert.match(auth, /twoFactor\(\{/);
  assert.match(auth, /maxFailedAttempts:\s*5/);
  assert.match(authClient, /twoFactorClient\(\)/);
  assert.match(authUi, /twoFactorRedirect/);
  assert.match(authUi, /\/two-factor\/verify-totp/);
  assert.match(power, /\/passkey\/list-user-passkeys/);
  assert.match(power, /\/passkey\/update-passkey/);
  assert.match(power, /\/passkey\/delete-passkey/);
  assert.match(html, /id="twoFactorSignInForm"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "twoFactor"/);
});

test("sync conflicts merge records and keep restorable cloud history", () => {
  assert.match(app, /function mergeCloudPayload/);
  assert.match(app, /toast\("Changes merged"/);
  assert.doesNotMatch(app, /Choose OK to keep this device's version/);
  assert.match(powerWorker, /\/features\/sync\/history/);
  assert.match(powerWorker, /Restored revision/);
  assert.match(migration, /user_data_versions/);
});

test("family workspace has dashboard, calendar, availability, invites, and discussions without roles", () => {
  for (const endpoint of [
    "/features/family/dashboard",
    "/features/family/events",
    "/features/family/availability",
    "/features/family/comments",
  ]) assert.match(powerWorker, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(html, /id="familyEventForm"/);
  assert.match(html, /id="familyAvailability"/);
  assert.match(html, /id="familyInviteQr"/);
  assert.match(power, /openFamilyDiscussion/);
  assert.doesNotMatch(migration, /family_role|family_roles/);
});

test("productivity features include natural language, richer recurrence, groceries, routines, and global search", () => {
  assert.match(app2, /every weekday/);
  assert.match(app2, /biweekly/);
  assert.match(app, /"weekdays" === t/);
  assert.match(app, /"biweekly" === t/);
  assert.match(app2, /function smartListItem/);
  assert.match(app2, /groceryCategories/);
  assert.match(html, /id="routineForm"/);
  assert.match(html, /id="globalSearchDialog"/);
  assert.match(power, /function allSearchRecords/);
});

test("safety and quality features cover trash, import preview, storage, accessibility, photos, and performance", () => {
  assert.match(app, /function moveToTrash/);
  assert.match(app, /function showUndo/);
  assert.match(html, /id="importPreviewDialog"/);
  assert.match(powerWorker, /\/features\/account\/storage/);
  assert.match(html, /class="skip-link"/);
  assert.match(power, /addPasswordToggles/);
  assert.match(app, /function compressPhotoBlob/);
  assert.match(app, /loading="lazy"/);
  assert.match(power, /PerformanceObserver/);
  assert.match(powerWorker, /performance_metrics/);
});

test("email verification remains disabled as requested", () => {
  assert.match(auth, /updateEmailWithoutVerification:\s*true/);
  assert.doesNotMatch(auth, /requireEmailVerification:\s*true/);
});
