import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const auth = readFileSync(new URL("../auth.js", import.meta.url), "utf8");
const authUi = readFileSync(new URL("../auth-ui.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

test("Better Auth is mounted with D1, email/password, and bearer sessions", () => {
  assert.match(worker, /p\.startsWith\("\/api\/auth\/"\)/);
  assert.match(auth, /d1Native:\s*env\.DB/);
  assert.match(auth, /emailAndPassword:\s*\{/);
  assert.match(auth, /enabled:\s*true/);
  assert.match(auth, /bearer\(\)/);
  assert.match(auth, /username\(\{/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "user"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "session"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS account/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS verification/);
  assert.match(schema, /username TEXT/);
});

test("settings provides accessible sign-in, sign-up, reset, and family email invite forms", () => {
  for (const id of [
    "signInForm",
    "signUpForm",
    "passwordResetRequestForm",
    "newPasswordForm",
    "settingsFamilyInviteForm",
    "settingsFamilyEmail",
    "welcomeCreateAccountBtn",
    "welcomeSignInBtn",
    "signUpUsername",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /type="email"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(authUi, /\/sign-in\/email/);
  assert.match(authUi, /\/sign-in\/username/);
  assert.match(authUi, /\/sign-up\/email/);
  assert.match(authUi, /\/request-password-reset/);
  assert.match(authUi, /\/reset-password/);
});

test("Turnstile protects sign-in and sign-up through the managed verification Worker", () => {
  assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.equal((html.match(/class="cf-turnstile"/g) || []).length, 2);
  assert.equal((html.match(/data-action="turnstile-spin-v1"/g) || []).length, 2);
  assert.match(authUi, /new FormData\(form\)\.get\("cf-turnstile-response"\)/);
  assert.match(authUi, /turnstileToken/);
  assert.match(worker, /verifyTurnstileToken\(E, turnstileToken\)/);
  assert.match(worker, /if \(!verification\.success\)/);
  assert.doesNotMatch(worker, /verification\.action !==/);
  assert.match(worker, /env\.TURNSTILE_VERIFY_URL/);
  assert.match(worker, /env\.TURNSTILE_VERIFY/);
  assert.match(wrangler, /binding = "TURNSTILE_VERIFY"/);
  assert.match(wrangler, /service = "turnstile-siteverify-daysie"/);
  assert.match(html, /api\.js\?render=explicit/);
  assert.match(authUi, /window\.turnstile\.render/);
  assert.match(authUi, /settingsDialog"\)\?\.open/);
  assert.match(authUi, /form\.offsetParent === null/);
});

test("family invitations can be delivered by email without removing code invites", () => {
  assert.match(worker, /inviteEmail/);
  assert.match(worker, /sendDaysieEmail/);
  assert.match(worker, /familyInviteEmail/);
  assert.match(worker, /Email delivery is unavailable\. Share the invite code instead\./);
  assert.match(worker, /invited_email/);
  assert.match(authUi, /familyInvite/);
  assert.match(authUi, /\/family\/invite/);
  assert.match(html, /Create a shareable code/);
});
