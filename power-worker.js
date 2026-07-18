const text = (value, limit = 160) =>
  String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, limit);

const json = (value, status, headers) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const changed = (result) =>
  Boolean(result?.meta && ((result.meta.changes || 0) > 0 || (result.meta.rows_written || 0) > 0));

async function familyFor(env, userId) {
  return env.DB.prepare(
    "SELECT family_id, name, emoji, color, availability, availability_until FROM family_members WHERE user_id = ?",
  )
    .bind(userId)
    .first();
}

async function bodyOf(request) {
  return request.json().catch(() => ({}));
}

async function addActivity(env, familyId, userId, action, details) {
  await env.DB.prepare(
    "INSERT INTO family_activity (id, family_id, user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      familyId,
      userId,
      action,
      details ? JSON.stringify(details) : null,
      Date.now(),
    )
    .run();
}

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    note: row.note || "",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: Boolean(row.all_day),
    recurrence: row.recurrence || "none",
    color: row.color || "#ffcd57",
    creatorUserId: row.creator_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handlePowerRequest({ request, env, userId, corsHeaders }) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/features/")) return null;
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  if (path === "/features/account/overview" && request.method === "GET") {
    const [user, passkeys, password, recovery] = await Promise.all([
      env.DB.prepare(
        'SELECT email, name, username, twoFactorEnabled FROM "user" WHERE id = ?',
      )
        .bind(userId)
        .first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM passkey WHERE userId = ?")
        .bind(userId)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM account WHERE userId = ? AND providerId = 'credential' AND password IS NOT NULL",
      )
        .bind(userId)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM recovery_codes WHERE user_id = ? AND used_at IS NULL",
      )
        .bind(userId)
        .first(),
    ]);
    return json(
      {
        user: user
          ? { email: user.email, name: user.name, username: user.username }
          : null,
        twoFactorEnabled: Boolean(user?.twoFactorEnabled),
        passkeyCount: Number(passkeys?.count || 0),
        hasPassword: Number(password?.count || 0) > 0,
        recoveryCodesRemaining: Number(recovery?.count || 0),
      },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/security/events" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id, event, details, ip, user_agent, created_at FROM security_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
    )
      .bind(userId)
      .all();
    return json(
      {
        events: (rows.results || []).map((row) => ({
          id: row.id,
          event: row.event,
          details: row.details ? JSON.parse(row.details) : null,
          ip: row.ip || null,
          userAgent: row.user_agent || null,
          createdAt: row.created_at,
        })),
      },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/sync/history" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id, revision, source, created_at, length(data) AS size FROM user_data_versions WHERE user_id = ? ORDER BY revision DESC LIMIT 20",
    )
      .bind(userId)
      .all();
    return json(
      {
        versions: (rows.results || []).map((row) => ({
          id: row.id,
          revision: row.revision,
          source: row.source || "Daysie device",
          createdAt: row.created_at,
          size: Number(row.size || 0),
        })),
      },
      200,
      corsHeaders,
    );
  }

  const restoreMatch = path.match(/^\/features\/sync\/history\/([^/]+)\/restore$/);
  if (restoreMatch && request.method === "POST") {
    const id = decodeURIComponent(restoreMatch[1]);
    const [version, current] = await Promise.all([
      env.DB.prepare(
        "SELECT data, revision FROM user_data_versions WHERE id = ? AND user_id = ?",
      )
        .bind(id, userId)
        .first(),
      env.DB.prepare("SELECT revision FROM user_data WHERE user_id = ?")
        .bind(userId)
        .first(),
    ]);
    if (!version) return json({ error: "Sync version not found" }, 404, corsHeaders);
    const revision = Number(current?.revision || 0) + 1;
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE user_data SET data = ?, revision = ?, updated_at = ? WHERE user_id = ?",
      ).bind(version.data, revision, now, userId),
      env.DB.prepare(
        "INSERT INTO user_data_versions (id, user_id, revision, data, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        userId,
        revision,
        version.data,
        `Restored revision ${version.revision}`,
        now,
      ),
    ]);
    return json(
      { success: true, revision, data: JSON.parse(version.data) },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/family/dashboard" && request.method === "GET") {
    const member = await familyFor(env, userId);
    if (!member)
      return json(
        { familyId: null, members: [], events: [], assignments: [], lists: [] },
        200,
        corsHeaders,
      );
    const [members, events, assignments, listRow] = await Promise.all([
      env.DB.prepare(
        "SELECT user_id, name, emoji, color, availability, availability_until FROM family_members WHERE family_id = ? ORDER BY joined",
      )
        .bind(member.family_id)
        .all(),
      env.DB.prepare(
        "SELECT * FROM family_events WHERE family_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 30",
      )
        .bind(member.family_id, Date.now() - 24 * 60 * 60 * 1000)
        .all(),
      env.DB.prepare(
        "SELECT id, from_user, to_user, kind, payload, fire_at, status, created FROM assigned_items WHERE family_id = ? AND status != 'done' ORDER BY COALESCE(fire_at, created) LIMIT 40",
      )
        .bind(member.family_id)
        .all(),
      env.DB.prepare("SELECT lists, updated FROM family_data WHERE family_id = ?")
        .bind(member.family_id)
        .first(),
    ]);
    return json(
      {
        familyId: member.family_id,
        members: (members.results || []).map((row) => ({
          userId: row.user_id,
          name: row.name,
          emoji: row.emoji,
          color: row.color,
          availability: row.availability || "free",
          availabilityUntil: row.availability_until || null,
          isMe: row.user_id === userId,
        })),
        events: (events.results || []).map(mapEvent),
        assignments: (assignments.results || []).map((row) => ({
          id: row.id,
          fromUserId: row.from_user,
          toUserId: row.to_user,
          kind: row.kind,
          payload: JSON.parse(row.payload || "{}"),
          fireAt: row.fire_at,
          status: row.status,
          createdAt: row.created,
        })),
        lists: listRow?.lists ? JSON.parse(listRow.lists) : [],
        listsUpdatedAt: listRow?.updated || 0,
      },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/family/events" && request.method === "GET") {
    const member = await familyFor(env, userId);
    if (!member) return json({ events: [] }, 200, corsHeaders);
    const from = Number(url.searchParams.get("from") || Date.now() - 31 * 86400000);
    const to = Number(url.searchParams.get("to") || Date.now() + 366 * 86400000);
    const rows = await env.DB.prepare(
      "SELECT * FROM family_events WHERE family_id = ? AND starts_at BETWEEN ? AND ? ORDER BY starts_at LIMIT 500",
    )
      .bind(member.family_id, from, to)
      .all();
    return json({ events: (rows.results || []).map(mapEvent) }, 200, corsHeaders);
  }

  if (path === "/features/family/events" && request.method === "POST") {
    const member = await familyFor(env, userId);
    if (!member) return json({ error: "Join a family before adding events" }, 400, corsHeaders);
    const body = await bodyOf(request);
    const title = text(body.title, 100);
    const startsAt = Number(body.startsAt);
    if (!title || !Number.isFinite(startsAt))
      return json({ error: "Event title and start time are required" }, 400, corsHeaders);
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO family_events (id, family_id, creator_user_id, title, note, starts_at, ends_at, all_day, recurrence, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        member.family_id,
        userId,
        title,
        text(body.note, 1000) || null,
        startsAt,
        Number.isFinite(Number(body.endsAt)) ? Number(body.endsAt) : null,
        body.allDay ? 1 : 0,
        ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"].includes(body.recurrence)
          ? body.recurrence
          : "none",
        text(body.color, 24) || "#ffcd57",
        now,
        now,
      )
      .run();
    await addActivity(env, member.family_id, userId, "event-created", { title });
    return json({ event: { id, title, startsAt } }, 201, corsHeaders);
  }

  const eventMatch = path.match(/^\/features\/family\/events\/([^/]+)$/);
  if (eventMatch && request.method === "PUT") {
    const member = await familyFor(env, userId);
    if (!member) return json({ error: "Family not found" }, 404, corsHeaders);
    const body = await bodyOf(request);
    const title = text(body.title, 100);
    const startsAt = Number(body.startsAt);
    if (!title || !Number.isFinite(startsAt))
      return json({ error: "Event title and start time are required" }, 400, corsHeaders);
    const result = await env.DB.prepare(
      "UPDATE family_events SET title = ?, note = ?, starts_at = ?, ends_at = ?, all_day = ?, recurrence = ?, color = ?, updated_at = ? WHERE id = ? AND family_id = ?",
    )
      .bind(
        title,
        text(body.note, 1000) || null,
        startsAt,
        Number.isFinite(Number(body.endsAt)) ? Number(body.endsAt) : null,
        body.allDay ? 1 : 0,
        ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"].includes(body.recurrence)
          ? body.recurrence
          : "none",
        text(body.color, 24) || "#ffcd57",
        Date.now(),
        decodeURIComponent(eventMatch[1]),
        member.family_id,
      )
      .run();
    return changed(result)
      ? json({ success: true }, 200, corsHeaders)
      : json({ error: "Event not found" }, 404, corsHeaders);
  }
  if (eventMatch && request.method === "DELETE") {
    const member = await familyFor(env, userId);
    if (!member) return json({ error: "Family not found" }, 404, corsHeaders);
    const result = await env.DB.prepare(
      "DELETE FROM family_events WHERE id = ? AND family_id = ?",
    )
      .bind(decodeURIComponent(eventMatch[1]), member.family_id)
      .run();
    return changed(result)
      ? json({ success: true }, 200, corsHeaders)
      : json({ error: "Event not found" }, 404, corsHeaders);
  }

  if (path === "/features/family/availability" && request.method === "PUT") {
    const member = await familyFor(env, userId);
    if (!member) return json({ error: "Family not found" }, 404, corsHeaders);
    const body = await bodyOf(request);
    const availability = ["free", "busy", "away", "quiet"].includes(body.availability)
      ? body.availability
      : "free";
    const until = Number.isFinite(Number(body.until)) ? Number(body.until) : null;
    await env.DB.prepare(
      "UPDATE family_members SET availability = ?, availability_until = ? WHERE user_id = ?",
    )
      .bind(availability, until, userId)
      .run();
    await addActivity(env, member.family_id, userId, "availability-changed", {
      availability,
      until,
    });
    return json({ success: true, availability, until }, 200, corsHeaders);
  }

  if (path === "/features/family/comments" && request.method === "GET") {
    const member = await familyFor(env, userId);
    if (!member) return json({ comments: [] }, 200, corsHeaders);
    const itemId = text(url.searchParams.get("itemId"), 100);
    if (!itemId) return json({ error: "itemId is required" }, 400, corsHeaders);
    const rows = await env.DB.prepare(
      "SELECT c.id, c.item_id, c.user_id, c.body, c.reaction, c.created_at, m.name, m.emoji FROM family_comments c LEFT JOIN family_members m ON m.user_id = c.user_id WHERE c.family_id = ? AND c.item_id = ? ORDER BY c.created_at LIMIT 100",
    )
      .bind(member.family_id, itemId)
      .all();
    return json(
      {
        comments: (rows.results || []).map((row) => ({
          id: row.id,
          itemId: row.item_id,
          userId: row.user_id,
          name: row.name || "Family member",
          emoji: row.emoji || "🌼",
          body: row.body || "",
          reaction: row.reaction || null,
          createdAt: row.created_at,
          isMe: row.user_id === userId,
        })),
      },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/family/comments" && request.method === "POST") {
    const member = await familyFor(env, userId);
    if (!member) return json({ error: "Family not found" }, 404, corsHeaders);
    const body = await bodyOf(request);
    const itemId = text(body.itemId, 100);
    const comment = text(body.body, 500);
    const reaction = ["👍", "❤️", "🎉", "🙏", "✅"].includes(body.reaction)
      ? body.reaction
      : null;
    if (!itemId || (!comment && !reaction))
      return json({ error: "Add a comment or reaction" }, 400, corsHeaders);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO family_comments (id, family_id, item_id, user_id, body, reaction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, member.family_id, itemId, userId, comment || null, reaction, Date.now())
      .run();
    return json({ id, success: true }, 201, corsHeaders);
  }

  const commentMatch = path.match(/^\/features\/family\/comments\/([^/]+)$/);
  if (commentMatch && request.method === "DELETE") {
    const result = await env.DB.prepare(
      "DELETE FROM family_comments WHERE id = ? AND user_id = ?",
    )
      .bind(decodeURIComponent(commentMatch[1]), userId)
      .run();
    return changed(result)
      ? json({ success: true }, 200, corsHeaders)
      : json({ error: "Comment not found" }, 404, corsHeaders);
  }

  if (path === "/features/account/storage" && request.method === "GET") {
    const [sync, versions, backups, photos, events, comments] = await Promise.all([
      env.DB.prepare("SELECT length(data) AS bytes FROM user_data WHERE user_id = ?")
        .bind(userId)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(length(data)), 0) AS bytes FROM user_data_versions WHERE user_id = ?",
      )
        .bind(userId)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM encrypted_backups WHERE user_id = ?",
      )
        .bind(userId)
        .first(),
      env.DB.prepare("SELECT key FROM photo_access WHERE user_id = ? LIMIT 500")
        .bind(userId)
        .all(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM family_events WHERE family_id = (SELECT family_id FROM family_members WHERE user_id = ?)",
      )
        .bind(userId)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM family_comments WHERE user_id = ?",
      )
        .bind(userId)
        .first(),
    ]);
    let photoBytes = 0;
    if (env.PHOTOS) {
      const rows = photos.results || [];
      for (let index = 0; index < rows.length; index += 50) {
        const objects = await Promise.all(
          rows.slice(index, index + 50).map((row) => env.PHOTOS.head(row.key)),
        );
        photoBytes += objects.reduce((sum, object) => sum + Number(object?.size || 0), 0);
      }
    }
    return json(
      {
        syncBytes: Number(sync?.bytes || 0),
        history: { count: Number(versions?.count || 0), bytes: Number(versions?.bytes || 0) },
        backups: { count: Number(backups?.count || 0), bytes: Number(backups?.bytes || 0) },
        photos: { count: (photos.results || []).length, bytes: photoBytes },
        familyEvents: Number(events?.count || 0),
        comments: Number(comments?.count || 0),
      },
      200,
      corsHeaders,
    );
  }

  if (path === "/features/metrics" && request.method === "POST") {
    const body = await bodyOf(request);
    const metric = text(body.metric, 32);
    const value = Number(body.value);
    if (!["LCP", "CLS", "INP", "FCP"].includes(metric) || !Number.isFinite(value))
      return json({ error: "Invalid performance metric" }, 400, corsHeaders);
    await env.DB.prepare(
      "INSERT INTO performance_metrics (id, user_id, metric, value, rating, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        userId,
        metric,
        Math.max(0, Math.min(value, 600000)),
        text(body.rating, 16) || null,
        text(body.path, 200) || null,
        Date.now(),
      )
      .run();
    return json({ success: true }, 202, corsHeaders);
  }

  return json({ error: "Feature route not found" }, 404, corsHeaders);
}
