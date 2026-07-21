const DAY = 86_400_000;

const clean = (value, limit = 160) =>
  String(value ?? "").replace(/[<>]/g, "").trim().slice(0, limit);

const reply = (value, status, headers) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const changed = (result) =>
  Number(result?.meta?.changes || result?.meta?.rows_written || 0) > 0;

async function parseBody(request, limit = 64 * 1024) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > limit)
    throw Object.assign(new Error("Request body is too large"), { status: 413 });
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      try { await reader.cancel(); } catch {}
      throw Object.assign(new Error("Request body is too large"), { status: 413 });
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON"), { status: 400 });
  }
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(timestamp, timeZone = "UTC") {
  const zone = validTimezone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(timestamp));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday") || "",
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    timeKey: `${get("hour")}:${get("minute")}`,
    timeZone: zone,
  };
}

function zonedDateTimeToUtc(parts, timeZone) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(guess, timeZone);
    const wantedWall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    const actualWall = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second || 0);
    guess += wantedWall - actualWall;
  }
  return guess;
}

export function nextOccurrence(timestamp, recurrence, timeZone = "UTC") {
  const current = zonedParts(timestamp, timeZone);
  const wall = new Date(Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second));
  if (recurrence === "daily") wall.setUTCDate(wall.getUTCDate() + 1);
  else if (recurrence === "weekdays") {
    do wall.setUTCDate(wall.getUTCDate() + 1);
    while ([0, 6].includes(wall.getUTCDay()));
  } else if (recurrence === "biweekly") wall.setUTCDate(wall.getUTCDate() + 14);
  else if (recurrence === "monthly") {
    const wantedDay = wall.getUTCDate();
    wall.setUTCDate(1);
    wall.setUTCMonth(wall.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 0)).getUTCDate();
    wall.setUTCDate(Math.min(wantedDay, lastDay));
  }
  else wall.setUTCDate(wall.getUTCDate() + 7);
  return zonedDateTimeToUtc(
    {
      year: wall.getUTCFullYear(),
      month: wall.getUTCMonth() + 1,
      day: wall.getUTCDate(),
      hour: wall.getUTCHours(),
      minute: wall.getUTCMinutes(),
      second: wall.getUTCSeconds(),
    },
    timeZone,
  );
}

async function familyFor(env, userId) {
  return env.DB.prepare("SELECT family_id FROM family_members WHERE user_id = ?")
    .bind(userId)
    .first();
}

async function activity(env, familyId, userId, action, details = null) {
  await env.DB.prepare(
    "INSERT INTO family_activity (id, family_id, user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(), familyId, userId, action,
    details ? JSON.stringify(details) : null, Date.now(),
  ).run();
}

async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function claimLegacyAccount(request, env, userId, corsHeaders) {
  const current = await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(userId).first();
  if (!current) return reply({ error: "Sign in to your Daysie account before migrating this device." }, 409, corsHeaders);
  const body = await parseBody(request);
  const legacyToken = clean(body.legacyToken, 200);
  if (!legacyToken) return reply({ error: "Legacy device token is required." }, 400, corsHeaders);
  const legacy = await env.DB.prepare("SELECT user_id, expires FROM sessions WHERE token = ?").bind(legacyToken).first();
  if (!legacy || Number(legacy.expires || 0) < Date.now() - 14 * DAY)
    return reply({ error: "This device connection is too old to migrate automatically." }, 410, corsHeaders);
  const legacyUserId = legacy.user_id;
  if (legacyUserId === userId) return reply({ migrated: false, alreadyCurrent: true }, 200, corsHeaders);
  const prior = await env.DB.prepare("SELECT better_auth_user_id FROM account_migrations WHERE legacy_user_id = ?").bind(legacyUserId).first();
  if (prior && prior.better_auth_user_id !== userId)
    return reply({ error: "This device was already migrated to another account." }, 409, corsHeaders);

  const [legacyFamily, currentFamily, targetData, targetPrefs] = await Promise.all([
    env.DB.prepare("SELECT family_id FROM family_members WHERE user_id = ?").bind(legacyUserId).first(),
    env.DB.prepare("SELECT family_id FROM family_members WHERE user_id = ?").bind(userId).first(),
    env.DB.prepare("SELECT user_id FROM user_data WHERE user_id = ?").bind(userId).first(),
    env.DB.prepare("SELECT user_id FROM notification_preferences WHERE user_id = ?").bind(userId).first(),
  ]);
  if (legacyFamily && currentFamily && legacyFamily.family_id !== currentFamily.family_id)
    return reply({ error: "Both accounts belong to different families. Leave one family before migrating." }, 409, corsHeaders);

  const statements = [
    env.DB.prepare("UPDATE push_subscriptions SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE photo_access SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE assigned_items SET from_user = ? WHERE from_user = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE assigned_items SET to_user = ? WHERE to_user = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_invites SET inviter_user_id = ? WHERE inviter_user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_events SET creator_user_id = ? WHERE creator_user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_comments SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_activity SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE encrypted_backups SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_chores SET creator_user_id = ? WHERE creator_user_id = ?").bind(userId, legacyUserId),
    env.DB.prepare("UPDATE family_chores SET assignee_order = replace(assignee_order, ?, ?) WHERE instr(assignee_order, ?) > 0").bind(legacyUserId, userId, legacyUserId),
    env.DB.prepare("INSERT OR REPLACE INTO account_migrations (legacy_user_id, better_auth_user_id, migrated_at) VALUES (?, ?, ?)").bind(legacyUserId, userId, Date.now()),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(legacyUserId),
  ];
  if (!targetData) {
    statements.push(env.DB.prepare("UPDATE user_data SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId));
    statements.push(env.DB.prepare("UPDATE user_data_versions SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId));
  }
  if (!targetPrefs) statements.push(env.DB.prepare("UPDATE notification_preferences SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId));
  else statements.push(env.DB.prepare("DELETE FROM notification_preferences WHERE user_id = ?").bind(legacyUserId));
  if (legacyFamily && currentFamily) statements.push(env.DB.prepare("DELETE FROM family_members WHERE user_id = ?").bind(legacyUserId));
  else if (legacyFamily) statements.push(env.DB.prepare("UPDATE family_members SET user_id = ? WHERE user_id = ?").bind(userId, legacyUserId));
  await env.DB.batch(statements);
  return reply({ migrated: true, legacyUserId, needsClientSync: Boolean(targetData) }, 200, corsHeaders);
}

export async function handleReliabilityRequest({ request, env, userId, corsHeaders, sendPush }) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/reliability/")) return null;
  if (!userId) return reply({ error: "Unauthorized" }, 401, corsHeaders);

  if (path === "/reliability/account/claim-legacy" && request.method === "POST")
    return claimLegacyAccount(request, env, userId, corsHeaders);

  if (path === "/reliability/account/finalize-legacy" && request.method === "POST") {
    const body = await parseBody(request);
    const legacyUserId = clean(body.legacyUserId, 100);
    const mapping = await env.DB.prepare("SELECT legacy_user_id FROM account_migrations WHERE legacy_user_id = ? AND better_auth_user_id = ?").bind(legacyUserId, userId).first();
    if (!mapping) return reply({ error: "Account migration was not found." }, 404, corsHeaders);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM user_data WHERE user_id = ?").bind(legacyUserId),
      env.DB.prepare("DELETE FROM user_data_versions WHERE user_id = ?").bind(legacyUserId),
      env.DB.prepare("DELETE FROM notification_digest_log WHERE user_id = ?").bind(legacyUserId),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(legacyUserId),
    ]);
    return reply({ finalized: true }, 200, corsHeaders);
  }

  if (path === "/reliability/notifications/diagnostics" && request.method === "GET") {
    const [devices, preferences, session] = await Promise.all([
      env.DB.prepare("SELECT id, device_name, enabled, created_at, updated_at, last_success_at, last_failure_at, last_status FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all(),
      env.DB.prepare("SELECT quiet_start, quiet_end, timezone, digest_morning, digest_evening, digest_weekly, digest_time FROM notification_preferences WHERE user_id = ?").bind(userId).first(),
      env.DB.prepare('SELECT CASE WHEN EXISTS(SELECT 1 FROM "session" WHERE userId = ?) THEN 1 ELSE 0 END AS better_auth').bind(userId).first(),
    ]);
    return reply({
      serverTime: Date.now(),
      authenticated: true,
      accountType: session?.better_auth ? "account" : "legacy-device",
      pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      preferences: preferences || null,
      devices: (devices.results || []).map((row) => ({
        id: row.id, name: row.device_name || "Daysie device", enabled: row.enabled !== 0,
        createdAt: row.created_at, updatedAt: row.updated_at,
        lastSuccessAt: row.last_success_at, lastFailureAt: row.last_failure_at,
        lastStatus: row.last_status,
      })),
    }, 200, corsHeaders);
  }

  const deviceMatch = path.match(/^\/reliability\/notifications\/devices\/([^/]+)$/);
  if (deviceMatch && request.method === "PATCH") {
    const body = await parseBody(request);
    const id = decodeURIComponent(deviceMatch[1]);
    const name = clean(body.name, 48);
    const enabled = body.enabled === false ? 0 : 1;
    const result = await env.DB.prepare("UPDATE push_subscriptions SET device_name = COALESCE(NULLIF(?, ''), device_name), enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(name, enabled, Date.now(), id, userId).run();
    return changed(result) ? reply({ success: true }, 200, corsHeaders) : reply({ error: "Device not found" }, 404, corsHeaders);
  }
  if (deviceMatch && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?")
      .bind(decodeURIComponent(deviceMatch[1]), userId).run();
    return changed(result) ? reply({ success: true }, 200, corsHeaders) : reply({ error: "Device not found" }, 404, corsHeaders);
  }

  if (path === "/reliability/family/receipts" && request.method === "GET") {
    const member = await familyFor(env, userId);
    if (!member) return reply({ receipts: [] }, 200, corsHeaders);
    const rows = await env.DB.prepare(
      "SELECT a.id, a.to_user, a.kind, a.payload, a.status, a.created, a.push_delivered_at, a.seen_at, a.completed_at, m.name, m.emoji FROM assigned_items a LEFT JOIN family_members m ON m.user_id = a.to_user WHERE a.family_id = ? AND a.from_user = ? ORDER BY a.created DESC LIMIT 100",
    ).bind(member.family_id, userId).all();
    return reply({ receipts: (rows.results || []).map((row) => ({
      id: row.id, toUserId: row.to_user, recipientName: row.name || "Family member", recipientEmoji: row.emoji || "🌼",
      kind: row.kind, payload: JSON.parse(row.payload || "{}"), status: row.status, createdAt: row.created,
      pushDeliveredAt: row.push_delivered_at, seenAt: row.seen_at, completedAt: row.completed_at,
    })) }, 200, corsHeaders);
  }

  const receiptMatch = path.match(/^\/reliability\/family\/assignments\/([^/]+)\/(seen|complete|snooze)$/);
  if (receiptMatch && request.method === "POST") {
    const id = decodeURIComponent(receiptMatch[1]);
    const action = receiptMatch[2];
    const item = await env.DB.prepare("SELECT id, family_id, from_user, to_user, payload FROM assigned_items WHERE id = ? AND to_user = ?").bind(id, userId).first();
    if (!item) return reply({ error: "Assignment not found" }, 404, corsHeaders);
    const now = Date.now();
    if (action === "seen") await env.DB.prepare("UPDATE assigned_items SET seen_at = COALESCE(seen_at, ?), status = CASE WHEN status = 'pending' THEN 'seen' ELSE status END WHERE id = ?").bind(now, id).run();
    if (action === "complete") await env.DB.prepare("UPDATE assigned_items SET seen_at = COALESCE(seen_at, ?), completed_at = ?, status = 'done' WHERE id = ?").bind(now, now, id).run();
    if (action === "snooze") {
      const body = await parseBody(request);
      const until = Math.min(now + 7 * DAY, Math.max(now + 5 * 60_000, Number(body.until) || now + 60 * 60_000));
      await env.DB.prepare("UPDATE assigned_items SET snoozed_until = ?, fire_at = ?, notified = 0, status = 'pending' WHERE id = ?").bind(until, until, id).run();
    }
    await activity(env, item.family_id, userId, `assignment-${action}`, { id, title: JSON.parse(item.payload || "{}").title || "Assignment" });
    if (action === "complete" && item.from_user !== userId) {
      await sendPush(item.from_user, { title: "✅ Family task completed", body: `${JSON.parse(item.payload || "{}").title || "A task"} was marked complete.`, tag: `receipt-${id}`, type: "family-receipt", url: `/?tab=family&receipt=${encodeURIComponent(id)}` }, "family");
    }
    return reply({ success: true, action }, 200, corsHeaders);
  }

  if (path === "/reliability/family/chores" && request.method === "GET") {
    const member = await familyFor(env, userId);
    if (!member) return reply({ chores: [] }, 200, corsHeaders);
    const rows = await env.DB.prepare("SELECT * FROM family_chores WHERE family_id = ? AND active = 1 ORDER BY next_due_at").bind(member.family_id).all();
    return reply({ chores: (rows.results || []).map((row) => ({ id: row.id, title: row.title, note: row.note || "", recurrence: row.recurrence, assigneeOrder: JSON.parse(row.assignee_order), nextAssigneeIndex: row.next_assignee_index, nextDueAt: row.next_due_at })) }, 200, corsHeaders);
  }
  if (path === "/reliability/family/chores" && request.method === "POST") {
    const member = await familyFor(env, userId);
    if (!member) return reply({ error: "Join a family first" }, 400, corsHeaders);
    const body = await parseBody(request);
    const title = clean(body.title, 100);
    const recurrence = ["daily", "weekdays", "weekly", "biweekly", "monthly"].includes(body.recurrence) ? body.recurrence : "weekly";
    const dueAt = Number(body.nextDueAt);
    const requested = Array.isArray(body.assigneeOrder) ? [...new Set(body.assigneeOrder.map((id) => clean(id, 100)).filter(Boolean))] : [];
    const members = await env.DB.prepare("SELECT user_id FROM family_members WHERE family_id = ?").bind(member.family_id).all();
    const allowed = new Set((members.results || []).map((row) => row.user_id));
    const assignees = requested.filter((id) => allowed.has(id));
    if (!title || !Number.isFinite(dueAt) || dueAt < Date.now() - 60_000 || !assignees.length)
      return reply({ error: "Add a title, future due time, and at least one family member." }, 400, corsHeaders);
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO family_chores (id, family_id, creator_user_id, title, note, recurrence, assignee_order, next_assignee_index, next_due_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)")
      .bind(id, member.family_id, userId, title, clean(body.note, 500) || null, recurrence, JSON.stringify(assignees), dueAt, now, now).run();
    await activity(env, member.family_id, userId, "chore-created", { id, title, recurrence });
    return reply({ id, success: true }, 201, corsHeaders);
  }
  const choreMatch = path.match(/^\/reliability\/family\/chores\/([^/]+)$/);
  if (choreMatch && request.method === "DELETE") {
    const member = await familyFor(env, userId);
    if (!member) return reply({ error: "Family not found" }, 404, corsHeaders);
    const result = await env.DB.prepare("UPDATE family_chores SET active = 0, updated_at = ? WHERE id = ? AND family_id = ?")
      .bind(Date.now(), decodeURIComponent(choreMatch[1]), member.family_id).run();
    return changed(result) ? reply({ success: true }, 200, corsHeaders) : reply({ error: "Chore not found" }, 404, corsHeaders);
  }

  if (path === "/reliability/family/availability" && request.method === "PUT") {
    const member = await familyFor(env, userId);
    if (!member) return reply({ error: "Family not found" }, 404, corsHeaders);
    const body = await parseBody(request);
    const availability = ["free", "busy", "away", "quiet"].includes(body.availability) ? body.availability : "free";
    const until = Number.isFinite(Number(body.until)) ? Number(body.until) : null;
    const dndUntil = Number.isFinite(Number(body.dndUntil)) ? Number(body.dndUntil) : null;
    const note = clean(body.note, 120) || null;
    await env.DB.prepare("UPDATE family_members SET availability = ?, availability_until = ?, availability_note = ?, dnd_until = ? WHERE user_id = ?")
      .bind(availability, until, note, dndUntil, userId).run();
    await activity(env, member.family_id, userId, "availability-changed", { availability, until, note, dndUntil });
    return reply({ success: true, availability, until, note, dndUntil }, 200, corsHeaders);
  }

  const verifyMatch = path.match(/^\/reliability\/backups\/([^/]+)\/verify$/);
  if (verifyMatch && request.method === "POST") {
    const id = decodeURIComponent(verifyMatch[1]);
    const row = await env.DB.prepare("SELECT envelope, size FROM encrypted_backups WHERE id = ? AND user_id = ?").bind(id, userId).first();
    if (!row) return reply({ error: "Backup not found" }, 404, corsHeaders);
    let envelope;
    try { envelope = JSON.parse(row.envelope); } catch { return reply({ error: "Backup envelope is corrupt" }, 422, corsHeaders); }
    if (envelope?.version !== 1 || envelope?.algorithm !== "AES-GCM" || !envelope?.iv || !envelope?.ciphertext)
      return reply({ error: "Backup envelope is incomplete" }, 422, corsHeaders);
    const envelopeHash = await hash(row.envelope);
    await env.DB.prepare("INSERT OR REPLACE INTO backup_verifications (backup_id, user_id, envelope_hash, verified_at) VALUES (?, ?, ?, ?)").bind(id, userId, envelopeHash, Date.now()).run();
    return reply({ validEnvelope: true, envelopeHash, size: row.size }, 200, corsHeaders);
  }

  return reply({ error: "Reliability route not found" }, 404, corsHeaders);
}

async function runChores(env, now, sendPush) {
  const rows = await env.DB.prepare("SELECT c.*, p.timezone FROM family_chores c LEFT JOIN notification_preferences p ON p.user_id = c.creator_user_id WHERE c.active = 1 AND c.next_due_at <= ? ORDER BY c.next_due_at LIMIT 100").bind(now).all();
  for (const chore of rows.results || []) {
    const assignees = JSON.parse(chore.assignee_order || "[]");
    if (!assignees.length) {
      await env.DB.prepare("UPDATE family_chores SET active = 0, updated_at = ? WHERE id = ?").bind(now, chore.id).run();
      continue;
    }
    const index = Number(chore.next_assignee_index || 0) % assignees.length;
    const assignee = assignees[index];
    const assignmentId = crypto.randomUUID();
    const payload = JSON.stringify({ title: chore.title, note: chore.note || "", recurring: true, choreId: chore.id });
    let nextDue = nextOccurrence(chore.next_due_at, chore.recurrence, chore.timezone || "UTC");
    for (let skipped = 0; nextDue <= now && skipped < 400; skipped += 1)
      nextDue = nextOccurrence(nextDue, chore.recurrence, chore.timezone || "UTC");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assigned_items (id, family_id, from_user, to_user, kind, payload, fire_at, status, notified, created, recurrence_id) VALUES (?, ?, ?, ?, 'task', ?, ?, 'pending', 0, ?, ?)").bind(assignmentId, chore.family_id, chore.creator_user_id, assignee, payload, chore.next_due_at, now, chore.id),
      env.DB.prepare("UPDATE family_chores SET next_assignee_index = ?, next_due_at = ?, updated_at = ? WHERE id = ? AND next_due_at = ?").bind((index + 1) % assignees.length, nextDue, now, chore.id, chore.next_due_at),
    ]);
    await activity(env, chore.family_id, chore.creator_user_id, "chore-assigned", { id: chore.id, assignmentId, title: chore.title, toUserId: assignee });
    const delivery = await sendPush(assignee, { title: `🧹 ${chore.title}`, body: "A recurring family chore is ready.", tag: assignmentId, type: "family-task", assignmentId, url: `/?tab=family&assignment=${encodeURIComponent(assignmentId)}` }, "family");
    if (delivery.sent > 0) await env.DB.prepare("UPDATE assigned_items SET notified = 1, push_delivered_at = ? WHERE id = ?").bind(Date.now(), assignmentId).run();
  }
}

async function runDigests(env, now, sendPush) {
  const rows = await env.DB.prepare("SELECT user_id, timezone, digest_morning, digest_evening, digest_weekly, digest_time FROM notification_preferences WHERE digest_morning = 1 OR digest_evening = 1 OR digest_weekly = 1").all();
  for (const preference of rows.results || []) {
    const local = zonedParts(now, preference.timezone || "UTC");
    const desired = /^([01]\d|2[0-3]):[0-5]\d$/.test(preference.digest_time || "") ? preference.digest_time : "08:00";
    const candidates = [];
    if (preference.digest_morning && local.timeKey === desired) candidates.push("morning");
    if (preference.digest_evening && local.timeKey === "18:00") candidates.push("evening");
    if (preference.digest_weekly && local.weekday === "Mon" && local.timeKey === desired) candidates.push("weekly");
    for (const digestType of candidates) {
      const periodKey = digestType === "weekly" ? `${local.dateKey}-week` : local.dateKey;
      const inserted = await env.DB.prepare("INSERT OR IGNORE INTO notification_digest_log (user_id, digest_type, period_key, sent_at) VALUES (?, ?, ?, ?)").bind(preference.user_id, digestType, periodKey, now).run();
      if (!changed(inserted)) continue;
      const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM assigned_items WHERE to_user = ? AND status != 'done'").bind(preference.user_id).first();
      const count = Number(pending?.count || 0);
      const delivery = await sendPush(preference.user_id, { title: digestType === "weekly" ? "🌼 Your Daysie week" : `🌼 Your ${digestType} Daysie`, body: count ? `${count} family item${count === 1 ? "" : "s"} waiting for you.` : "You’re all caught up.", tag: `digest-${digestType}-${periodKey}`, type: "digest", url: "/?tab=today" }, "reminders");
      if (delivery.attempted === 0) await env.DB.prepare("DELETE FROM notification_digest_log WHERE user_id = ? AND digest_type = ? AND period_key = ?").bind(preference.user_id, digestType, periodKey).run();
    }
  }
}

export async function runReliabilitySchedule(env, timestamp, sendPush) {
  await runChores(env, timestamp, sendPush);
  await runDigests(env, timestamp, sendPush);
}
