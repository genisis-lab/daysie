import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS family_members (family_id TEXT, user_id TEXT PRIMARY KEY, name TEXT, emoji TEXT, color TEXT, joined INTEGER);
    CREATE TABLE IF NOT EXISTS assigned_items (id TEXT PRIMARY KEY, family_id TEXT, from_user TEXT, to_user TEXT, kind TEXT, payload TEXT, fire_at INTEGER, status TEXT, notified INTEGER, created INTEGER);
    CREATE TABLE IF NOT EXISTS notification_preferences (user_id TEXT PRIMARY KEY, quiet_start TEXT, quiet_end TEXT, timezone TEXT NOT NULL DEFAULT 'UTC', categories TEXT NOT NULL DEFAULT '{"reminders":true,"family":true,"lists":true}', tone TEXT NOT NULL DEFAULT 'system', vibration TEXT NOT NULL DEFAULT 'system', updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL, device_name TEXT, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_success_at INTEGER, last_failure_at INTEGER, last_status INTEGER);
  `);
});

describe("Daysie Worker runtime", () => {
  it("boots in the Workers runtime and reports bound storage", async () => {
    const response = await SELF.fetch("https://daysie.test/health");
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health.ok).toBe(true);
    expect(health.storage).toEqual({ d1: true, photos: true });
    expect(health.services.passkeys).toBe(true);
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
      headers: { "Content-Type": "application/json", Origin: "https://daysie.pages.dev" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Complete the security check" });
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
    expect(await assignment.json()).toMatchObject({
      success: true,
      delivery: { attempted: 0, sent: 0, failed: 0 },
    });

    const inbox = await SELF.fetch("https://daysie.test/family/inbox", {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    expect(inbox.status).toBe(200);
    expect(await inbox.json()).toMatchObject({
      items: [{ kind: "task", payload: { title: "Runtime family task" } }],
    });
  });
});
