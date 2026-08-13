import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../worker.js";
import { createDaysieAuth } from "../auth.js";
import { nextOccurrence, zonedParts } from "../reliability-worker.js";

beforeAll(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, twoFactorEnabled INTEGER NOT NULL DEFAULT 0, username TEXT, displayUsername TEXT, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY NOT NULL, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS "twoFactor" (id TEXT PRIMARY KEY NOT NULL, secret TEXT NOT NULL, backupCodes TEXT NOT NULL, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, verified INTEGER NOT NULL DEFAULT 1, failedVerificationCount INTEGER NOT NULL DEFAULT 0, lockedUntil INTEGER);
    CREATE TABLE IF NOT EXISTS family_members (family_id TEXT, user_id TEXT PRIMARY KEY, name TEXT, emoji TEXT, color TEXT, joined INTEGER, availability TEXT DEFAULT 'free', availability_until INTEGER, availability_note TEXT, dnd_until INTEGER);
    CREATE TABLE IF NOT EXISTS family_invites (code TEXT PRIMARY KEY, family_id TEXT, created INTEGER, expires INTEGER, invited_email TEXT, inviter_user_id TEXT);
    CREATE TABLE IF NOT EXISTS family_activity (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS family_events (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, creator_user_id TEXT NOT NULL, title TEXT NOT NULL, note TEXT, starts_at INTEGER NOT NULL, ends_at INTEGER, all_day INTEGER NOT NULL DEFAULT 0, recurrence TEXT NOT NULL DEFAULT 'none', color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS family_comments (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, item_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT, reaction TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS assigned_items (id TEXT PRIMARY KEY, family_id TEXT, from_user TEXT, to_user TEXT, kind TEXT, payload TEXT, fire_at INTEGER, status TEXT, notified INTEGER, created INTEGER, push_delivered_at INTEGER, seen_at INTEGER, completed_at INTEGER, snoozed_until INTEGER, recurrence_id TEXT);
    CREATE TABLE IF NOT EXISTS notification_preferences (user_id TEXT PRIMARY KEY, quiet_start TEXT, quiet_end TEXT, timezone TEXT NOT NULL DEFAULT 'UTC', categories TEXT NOT NULL DEFAULT '{"reminders":true,"family":true,"lists":true}', tone TEXT NOT NULL DEFAULT 'system', vibration TEXT NOT NULL DEFAULT 'system', digest_morning INTEGER NOT NULL DEFAULT 0, digest_evening INTEGER NOT NULL DEFAULT 0, digest_weekly INTEGER NOT NULL DEFAULT 0, digest_time TEXT NOT NULL DEFAULT '08:00', updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL, device_name TEXT, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_success_at INTEGER, last_failure_at INTEGER, last_status INTEGER, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS user_data_versions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, source TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, revision));
    CREATE TABLE IF NOT EXISTS photo_access (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS encrypted_backups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, envelope TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_migrations (legacy_user_id TEXT PRIMARY KEY, better_auth_user_id TEXT NOT NULL, migrated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS family_chores (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, creator_user_id TEXT NOT NULL, title TEXT NOT NULL, note TEXT, recurrence TEXT NOT NULL, assignee_order TEXT NOT NULL, next_assignee_index INTEGER NOT NULL DEFAULT 0, next_due_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_digest_log (user_id TEXT NOT NULL, digest_type TEXT NOT NULL, period_key TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (user_id, digest_type, period_key));
    CREATE TABLE IF NOT EXISTS backup_verifications (backup_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, envelope_hash TEXT NOT NULL, verified_at INTEGER NOT NULL);
  `);
});

const cookieHeader = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");

const base32Bytes = (value) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of String(value).replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(bytes);
};

async function currentTotp(uri) {
  const parsed = new URL(uri);
  const key = await crypto.subtle.importKey(
    "raw",
    base32Bytes(parsed.searchParams.get("secret")),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = Math.floor(Date.now() / 30_000);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 15;
  const code = (
    ((digest[offset] & 127) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  ) % 1_000_000;
  return String(code).padStart(6, "0");
}

describe("Daysie Worker runtime", () => {
  it("boots in the Workers runtime and reports minimal liveness", async () => {
    const response = await SELF.fetch("https://daysie.test/health");
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health).toEqual({ ok: true, service: "daysie-api" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("rejects requests from untrusted browser origins", async () => {
    const response = await SELF.fetch("https://daysie.test/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({ error: "Origin not allowed" });
  });

  it("accepts the canonical and legacy frontend origins", async () => {
    for (const origin of [
      "https://daysie.builtwai.com",
      "https://daysie.pages.dev",
    ]) {
      const response = await SELF.fetch("https://daysie.test/health", {
        headers: { Origin: origin },
      });
      expect(response.status, origin).toBe(200);
      expect(response.headers.get("access-control-allow-origin"), origin).toBe(origin);
      expect(response.headers.get("access-control-allow-credentials"), origin).toBe("true");
    }
  });

  it("rejects oversized JSON bodies before route processing", async () => {
    const response = await SELF.fetch("https://daysie.test/pair/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABC123", padding: "x".repeat(5_000) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Request body is too large" });
  });

  it("requires authentication before reading or writing sync data", async () => {
    const read = await SELF.fetch("https://daysie.test/data");
    const write = await SELF.fetch("https://daysie.test/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles: [] }),
    });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("rejects password sign-in before auth when Turnstile is missing", async () => {
    const response = await SELF.fetch("https://daysie.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://daysie.builtwai.com" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Complete the security check" });
  });

  it("supports account creation, password sign-in, and the complete 2FA challenge on the custom domain", async () => {
    const origin = "https://daysie.builtwai.com";
    const email = `domain-auth-${crypto.randomUUID()}@example.com`;
    const password = "Domain-auth-test-123!";
    const username = `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const authRequest = (path, body, cookie = "") =>
      new Request(`https://daysie-api.neil27.workers.dev/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });

    const signUpRequest = authRequest("/sign-up/email", {
      name: "Domain Auth Test",
      username,
      email,
      password,
    });
    const signUp = await createDaysieAuth(env, signUpRequest).handler(signUpRequest);
    expect(signUp.status).toBe(200);
    expect(await signUp.clone().json()).toMatchObject({ user: { email } });
    const accountCookie = cookieHeader(signUp);
    expect(accountCookie).toContain("session");

    const enableRequest = authRequest("/two-factor/enable", {
      password,
      issuer: "Daysie",
    }, accountCookie);
    const enabled = await createDaysieAuth(env, enableRequest).handler(enableRequest);
    expect(enabled.status).toBe(200);
    const setup = await enabled.json();
    expect(setup.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.backupCodes.length).toBeGreaterThan(0);

    const confirmRequest = authRequest("/two-factor/verify-totp", {
      code: await currentTotp(setup.totpURI),
      trustDevice: false,
    }, accountCookie);
    const confirmed = await createDaysieAuth(env, confirmRequest).handler(confirmRequest);
    expect(confirmed.status).toBe(200);

    const signInRequest = authRequest("/sign-in/email", {
      email,
      password,
      rememberMe: true,
    });
    const signIn = await createDaysieAuth(env, signInRequest).handler(signInRequest);
    expect(signIn.status).toBe(200);
    expect(await signIn.clone().json()).toMatchObject({ twoFactorRedirect: true });
    const challengeCookie = cookieHeader(signIn);
    expect(challengeCookie).toContain("two_factor");

    const verifyRequest = authRequest("/two-factor/verify-totp", {
      code: await currentTotp(setup.totpURI),
      trustDevice: true,
    }, challengeCookie);
    const verified = await createDaysieAuth(env, verifyRequest).handler(verifyRequest);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ user: { email } });
  });

  it("protects all feature-suite account and family endpoints", async () => {
    for (const path of [
      "/features/account/overview",
      "/features/security/events",
      "/features/sync/history",
      "/features/family/dashboard",
      "/features/family/events",
      "/features/family/comments?itemId=task-1",
      "/features/account/storage",
    ]) {
      const response = await SELF.fetch(`https://daysie.test${path}`);
      expect(response.status, path).toBe(401);
      expect(await response.json(), path).toEqual({ error: "Unauthorized" });
    }
  });

  it("protects notification status and test delivery endpoints", async () => {
    const status = await SELF.fetch("https://daysie.test/push/status");
    const testPush = await SELF.fetch("https://daysie.test/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(status.status).toBe(401);
    expect(testPush.status).toBe(401);
  });

  it("protects reliability, device, receipt, and chore endpoints", async () => {
    for (const [path, method] of [
      ["/reliability/notifications/diagnostics", "GET"],
      ["/reliability/notifications/devices/missing", "DELETE"],
      ["/reliability/family/receipts", "GET"],
      ["/reliability/family/chores", "GET"],
      ["/reliability/backups/missing/verify", "POST"],
    ]) {
      const response = await SELF.fetch(`https://daysie.test${path}`, { method });
      expect(response.status, path).toBe(401);
    }
  });

  it("accepts an active PWA bearer session for notification tests", async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, Date.now()),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, Date.now() + 60_000),
    ]);
    const response = await SELF.fetch("https://daysie.test/push/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "No notification devices are connected yet.",
      attempted: 0,
    });
  });

  it("rejects an expired legacy PWA session without silently renewing it", async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiredAt = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, Date.now()),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, expiredAt),
    ]);
    const response = await SELF.fetch("https://daysie.test/push/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    const stored = await env.DB.prepare("SELECT expires FROM sessions WHERE token = ?").bind(token).first();
    expect(stored.expires).toBe(expiredAt);
  });

  it("rejects active-content image uploads", async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, Date.now()),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, Date.now() + 60_000),
    ]);
    const response = await SELF.fetch("https://daysie.test/photo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/svg+xml" },
      body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Unsupported image format" });
  });

  it("rejects malformed Web Push key material", async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, Date.now()),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, Date.now() + 60_000),
    ]);
    const response = await SELF.fetch("https://daysie.test/push/subscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: `https://web.push.apple.com/${crypto.randomUUID()}`,
        keys: { p256dh: "x", auth: "y" },
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid push subscription" });
  });

  it("delivers a family task to the recipient inbox even without push", async () => {
    const familyId = crypto.randomUUID();
    const senderId = crypto.randomUUID();
    const recipientId = crypto.randomUUID();
    const senderToken = crypto.randomUUID();
    const recipientToken = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(senderId, now),
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(recipientId, now),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(senderToken, senderId, now + 60_000),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(recipientToken, recipientId, now + 60_000),
      env.DB.prepare("INSERT INTO family_members (family_id, user_id, name, emoji, color, joined) VALUES (?, ?, 'Sender', '🌼', 'sun', ?)").bind(familyId, senderId, now),
      env.DB.prepare("INSERT INTO family_members (family_id, user_id, name, emoji, color, joined) VALUES (?, ?, 'Recipient', '🌱', 'mint', ?)").bind(familyId, recipientId, now),
    ]);

    const assignment = await SELF.fetch("https://daysie.test/family/assign", {
      method: "POST",
      headers: { Authorization: `Bearer ${senderToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        toUser: recipientId,
        task: { title: "Runtime family task", due: now + 3_600_000 },
      }),
    });
    expect(assignment.status).toBe(200);
    const assigned = await assignment.json();
    expect(assigned).toMatchObject({
      success: true,
      delivery: { attempted: 0, sent: 0, failed: 0 },
    });

    const invalidAck = await SELF.fetch("https://daysie.test/family/inbox/ack", {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: assigned.id, status: "admin" }),
    });
    expect(invalidAck.status).toBe(400);
    const unchanged = await env.DB.prepare("SELECT status FROM assigned_items WHERE id = ?").bind(assigned.id).first();
    expect(unchanged.status).toBe("pending");

    const inbox = await SELF.fetch("https://daysie.test/family/inbox", {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    expect(inbox.status).toBe(200);
    expect(await inbox.json()).toMatchObject({
      items: [{ kind: "task", payload: { title: "Runtime family task" } }],
    });

    const seen = await SELF.fetch(`https://daysie.test/reliability/family/assignments/${assigned.id}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(seen.status).toBe(200);
    const completed = await SELF.fetch(`https://daysie.test/reliability/family/assignments/${assigned.id}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(completed.status).toBe(200);
    const receipt = await SELF.fetch("https://daysie.test/reliability/family/receipts", {
      headers: { Authorization: `Bearer ${senderToken}` },
    });
    expect(await receipt.json()).toMatchObject({
      receipts: [{ id: assigned.id, status: "done" }],
    });
  });

  it("lets each user rename, pause, and remove only their notification devices", async () => {
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, now),
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(otherUserId, now),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, now + 60_000),
      env.DB.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, subscription, device_name, created_at, updated_at, enabled) VALUES (?, ?, ?, ?, 'Phone', ?, ?, 1)").bind(deviceId, userId, `https://web.push.apple.com/${deviceId}`, JSON.stringify({ endpoint: `https://web.push.apple.com/${deviceId}`, keys: { p256dh: "x", auth: "y" } }), now, now),
    ]);
    const renamed = await SELF.fetch(`https://daysie.test/reliability/notifications/devices/${deviceId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Kitchen iPad", enabled: false }),
    });
    expect(renamed.status).toBe(200);
    const stored = await env.DB.prepare("SELECT device_name, enabled FROM push_subscriptions WHERE id = ?").bind(deviceId).first();
    expect(stored).toMatchObject({ device_name: "Kitchen iPad", enabled: 0 });
    const removed = await SELF.fetch(`https://daysie.test/reliability/notifications/devices/${deviceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(removed.status).toBe(200);
  });

  it("creates and rotates recurring family chores in the scheduled handler", async () => {
    const familyId = crypto.randomUUID();
    const creatorId = crypto.randomUUID();
    const nextId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(creatorId, now),
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(nextId, now),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, creatorId, now + 60_000),
      env.DB.prepare("INSERT INTO family_members (family_id, user_id, name, joined) VALUES (?, ?, 'Creator', ?)").bind(familyId, creatorId, now),
      env.DB.prepare("INSERT INTO family_members (family_id, user_id, name, joined) VALUES (?, ?, 'Next', ?)").bind(familyId, nextId, now),
    ]);
    const created = await SELF.fetch("https://daysie.test/reliability/family/chores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Recycling", recurrence: "weekly", nextDueAt: now + 1_000, assigneeOrder: [creatorId, nextId] }),
    });
    expect(created.status).toBe(201);
    await worker.scheduled({}, env, { waitUntil() {} });
    // The first run is not due yet, so move it into the past and run again.
    await env.DB.prepare("UPDATE family_chores SET next_due_at = ? WHERE family_id = ?").bind(Date.now() - 1_000, familyId).run();
    await worker.scheduled({}, env, { waitUntil() {} });
    const assignment = await env.DB.prepare("SELECT to_user, recurrence_id FROM assigned_items WHERE family_id = ? AND recurrence_id IS NOT NULL ORDER BY created DESC LIMIT 1").bind(familyId).first();
    expect(assignment).toMatchObject({ to_user: creatorId });
    const chore = await env.DB.prepare("SELECT next_assignee_index, next_due_at FROM family_chores WHERE family_id = ?").bind(familyId).first();
    expect(chore.next_assignee_index).toBe(1);
    expect(chore.next_due_at).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it("keeps local wall-clock recurrence stable across daylight-saving changes", () => {
    const beforeDst = Date.parse("2026-03-07T14:00:00Z"); // 09:00 America/New_York
    const next = nextOccurrence(beforeDst, "daily", "America/New_York");
    const local = zonedParts(next, "America/New_York");
    expect(local).toMatchObject({ year: 2026, month: 3, day: 8, hour: 9, minute: 0 });
    expect(next - beforeDst).toBe(23 * 60 * 60 * 1000);
    const januaryEnd = Date.parse("2026-01-31T14:00:00Z");
    expect(zonedParts(nextOccurrence(januaryEnd, "monthly", "America/New_York"), "America/New_York"))
      .toMatchObject({ year: 2026, month: 2, day: 28, hour: 9 });
  });

  it("claims a legacy device into an authenticated account without losing family links", async () => {
    const familyId = crypto.randomUUID();
    const legacyId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const legacyToken = crypto.randomUUID();
    const accountToken = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(legacyId, now),
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(accountId, now),
      env.DB.prepare('INSERT INTO "user" (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').bind(accountId, "claim@example.com", "Claim", now, now),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(legacyToken, legacyId, now + 60_000),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(accountToken, accountId, now + 60_000),
      env.DB.prepare("INSERT INTO family_members (family_id, user_id, name, joined) VALUES (?, ?, 'Legacy', ?)").bind(familyId, legacyId, now),
      env.DB.prepare("INSERT INTO user_data (user_id, data, updated_at, revision) VALUES (?, ?, ?, 1)").bind(legacyId, JSON.stringify({ profiles: [{ id: "me" }] }), now),
    ]);
    const response = await SELF.fetch("https://daysie.test/reliability/account/claim-legacy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accountToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ legacyToken }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ migrated: true, legacyUserId: legacyId });
    const member = await env.DB.prepare("SELECT user_id FROM family_members WHERE family_id = ?").bind(familyId).first();
    expect(member.user_id).toBe(accountId);
    const data = await env.DB.prepare("SELECT user_id FROM user_data WHERE user_id = ?").bind(accountId).first();
    expect(data.user_id).toBe(accountId);
  });

  it("does not expose internal exception details", async () => {
    const userId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").bind(userId, now),
      env.DB.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, now + 60_000),
      env.DB.prepare("INSERT INTO user_data (user_id, data, updated_at, revision) VALUES (?, ?, ?, 1)").bind(userId, "{not-json", now),
    ]);
    const response = await SELF.fetch("https://daysie.test/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
