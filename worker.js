import {
  createDaysieAuth,
  familyInviteEmail,
  sendDaysieEmail,
} from "./auth.js";

let e = !1;
export default {
  async fetch(e, E, executionContext) {
    const p = new URL(e.url).pathname,
      m = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Daysie-Legacy-Token",
        "Access-Control-Expose-Headers": "set-auth-token",
      };
    if ("OPTIONS" === e.method) return new Response(null, { headers: m });
    try {
      if (p.startsWith("/api/auth/")) {
        let authRequest = e;
        if (
          "POST" === e.method &&
          ("/api/auth/sign-in/email" === p || "/api/auth/sign-up/email" === p)
        ) {
          const payload = await e.json().catch(() => ({}));
          const turnstileToken = String(payload.turnstileToken || "");
          if (!turnstileToken)
            return c({ error: "Complete the security check" }, 400, m);
          const verification = await verifyTurnstileToken(E, turnstileToken);
          if (
            !verification.success ||
            verification.action !== "turnstile-spin-v1"
          )
            return c({ error: "Security check failed. Please try again." }, 403, m);
          delete payload.turnstileToken;
          authRequest = new Request(e.url, {
            method: e.method,
            headers: e.headers,
            body: JSON.stringify(payload),
          });
        }
        const response = await createDaysieAuth(
          E,
          authRequest,
          executionContext,
        ).handler(authRequest);
        const headers = new Headers(response.headers);
        Object.entries(m).forEach(([name, value]) => headers.set(name, value));
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      if ((await i(E), "/health" === p && "GET" === e.method)) {
        let r = !1;
        try {
          (await E.DB.prepare("SELECT 1 AS ok").first(), (r = !0));
        } catch (e) {}
        return c(
          {
            ok: r,
            service: "daysie-api",
            storage: { d1: r, photos: !!E.PHOTOS },
            time: new Date().toISOString(),
          },
          r ? 200 : 503,
          m,
        );
      }
      if ("/account/create" === p && "POST" === e.method) {
        const r = e.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await u(E, "acct:" + r, 10, 36e5)))
          return c(
            {
              error: "Too many new accounts from this network. Please wait.",
            },
            429,
            m,
          );
        const i = crypto.randomUUID();
        await E.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)")
          .bind(i, Date.now())
          .run();
        return c({ token: await s(E, i), userId: i }, 200, m);
      }
      if ("/pair/create" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        let t;
        await E.DB.prepare("DELETE FROM pair_codes WHERE user_id = ?")
          .bind(i)
          .run();
        for (let e = 0; e < 5; e++) {
          t = o(6);
          if (
            !(await E.DB.prepare("SELECT code FROM pair_codes WHERE code = ?")
              .bind(t)
              .first())
          )
            break;
        }
        const a = Date.now() + 18e4;
        return (
          await E.DB.prepare(
            "INSERT INTO pair_codes (code, user_id, expires, attempts, redeemed, approved) VALUES (?, ?, ?, 0, 0, 0)",
          )
            .bind(t, i, a)
            .run(),
          c({ code: t, expires: a }, 200, m)
        );
      }
      if ("/pair/redeem" === p && "POST" === e.method) {
        const r = e.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await u(E, "redeem:" + r, 10, 6e4)))
          return c(
            { error: "Too many attempts. Please wait a minute." },
            429,
            m,
          );
        const { code: i } = await e.json(),
          t = (i || "").trim().toUpperCase();
        if (!t) return c({ error: "Missing code" }, 400, m);
        const a = await E.DB.prepare("SELECT * FROM pair_codes WHERE code = ?")
          .bind(t)
          .first();
        if (!a || a.expires < Date.now())
          return (
            a &&
              (await E.DB.prepare("DELETE FROM pair_codes WHERE code = ?")
                .bind(t)
                .run()),
            c({ error: "Invalid or expired code" }, 404, m)
          );
        const n = (a.attempts || 0) + 1,
          d = crypto.randomUUID();
        if (n > 5)
          return (
            await E.DB.prepare("DELETE FROM pair_codes WHERE code = ?")
              .bind(t)
              .run(),
            c({ error: "Too many attempts" }, 429, m)
          );
        const l = await E.DB.prepare(
          "UPDATE pair_codes SET attempts = ?, redeemed = 1, redeem_nonce = ? WHERE code = ? AND redeemed = 0 AND approved = 0 AND expires > ?",
        )
          .bind(n, d, t, Date.now())
          .run();
        return g(l)
          ? c({ status: "pending", nonce: d }, 200, m)
          : c({ error: "Code already pending or approved" }, 409, m);
      }
      if ("/pair/pending" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT code FROM pair_codes WHERE user_id = ? AND redeemed = 1 AND approved = 0 AND expires > ?",
        )
          .bind(i, Date.now())
          .first();
        return c({ pending: !!t, code: t ? t.code : null }, 200, m);
      }
      if ("/pair/approve" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const { code: t } = await e.json(),
          a = (t || "").trim().toUpperCase(),
          n = await E.DB.prepare(
            "SELECT * FROM pair_codes WHERE code = ? AND user_id = ? AND redeemed = 1 AND approved = 0 AND redeem_nonce IS NOT NULL",
          )
            .bind(a, i)
            .first();
        if (!n || n.expires < Date.now())
          return c({ error: "Invalid or expired code" }, 404, m);
        const o = await s(E, i);
        const l = await E.DB.prepare(
          "UPDATE pair_codes SET approved = 1, session_token = ? WHERE code = ? AND user_id = ? AND redeemed = 1 AND approved = 0 AND redeem_nonce IS NOT NULL",
        )
          .bind(o, a, i)
          .run();
        if (!g(l)) return c({ error: "Invalid or expired code" }, 404, m);
        return c({ success: !0 }, 200, m);
      }
      if ("/pair/deny" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const { code: t } = await e.json(),
          a = (t || "").trim().toUpperCase();
        return (
          await E.DB.prepare(
            "DELETE FROM pair_codes WHERE code = ? AND user_id = ?",
          )
            .bind(a, i)
            .run(),
          c({ success: !0 }, 200, m)
        );
      }
      if ("/pair/status" === p && "POST" === e.method) {
        const { code: r, nonce: a } = await e.json(),
          i = (r || "").trim().toUpperCase(),
          n = String(a || ""),
          t = await E.DB.prepare(
            "SELECT * FROM pair_codes WHERE code = ? AND redeem_nonce = ?",
          )
            .bind(i, n)
            .first();
        if (!i || !n) return c({ status: "gone" }, 200, m);
        if (!t) return c({ status: "gone" }, 200, m);
        if (t.expires < Date.now())
          return (
            await E.DB.prepare("DELETE FROM pair_codes WHERE code = ?")
              .bind(i)
              .run(),
            c({ status: "expired" }, 200, m)
          );
        if (1 === t.approved && t.session_token) {
          const e = t.session_token,
            r = t.user_id;
          return (
            await E.DB.prepare("DELETE FROM pair_codes WHERE code = ?")
              .bind(i)
              .run(),
            c({ status: "approved", token: e, userId: r }, 200, m)
          );
        }
        return c({ status: "pending" }, 200, m);
      }
      if ("/sessions/revoke-others" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = e.headers.get("Authorization") || "",
          a = t.startsWith("Bearer ") ? t.substring(7) : "";
        return (
          await E.DB.prepare(
            "DELETE FROM sessions WHERE user_id = ? AND token != ?",
          )
            .bind(i, a)
            .run(),
          c({ success: !0 }, 200, m)
        );
      }
      if ("/sessions" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = e.headers.get("Authorization") || "",
          a = t.startsWith("Bearer ") ? t.substring(7) : "",
          n = await E.DB.prepare(
            "SELECT token, expires FROM sessions WHERE user_id = ? ORDER BY expires DESC",
          )
            .bind(i)
            .all();
        return c(
          {
            sessions: (n.results || []).map((e) => ({
              current: e.token === a,
              tokenSuffix: String(e.token || "").slice(-6),
              expires: e.expires,
            })),
          },
          200,
          m,
        );
      }
      if ("/data" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT data FROM user_data WHERE user_id = ?",
        )
          .bind(i)
          .first();
        return c(t ? JSON.parse(t.data) : { profiles: [] }, 200, m);
      }
      if ("/data" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await e.json(),
          a = JSON.stringify(t);
        return a.length > 1e6
          ? c({ error: "Data too large to sync" }, 413, m)
          : (await E.DB.prepare(
              "INSERT OR REPLACE INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)",
            )
              .bind(i, a, Date.now())
              .run(),
            c({ success: !0 }, 200, m));
      }
      if ("/push/subscribe" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await e.json();
        if (!isSafePushEndpoint(t))
          return c({ error: "Invalid push endpoint" }, 400, m);
        return (
          await E.DB.prepare(
            "INSERT OR REPLACE INTO push_subscriptions (user_id, subscription, created_at) VALUES (?, ?, ?)",
          )
            .bind(i, JSON.stringify(t), Date.now())
            .run(),
          c({ success: !0 }, 200, m)
        );
      }
      if ("/photo" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        if (!E.PHOTOS)
          return c({ error: "Photo storage not configured" }, 503, m);
        const t = e.headers.get("Content-Type") || "image/jpeg";
        if (!/^image\//.test(t))
          return c({ error: "Only images can be uploaded" }, 415, m);
        const a = Number(e.headers.get("Content-Length") || 0);
        if (!a || a > 8388608)
          return c({ error: "Photo too large (max 8 MB)" }, 413, m);
        const n = `${i}/${crypto.randomUUID()}`,
          s = crypto.randomUUID();
        return (
          await E.PHOTOS.put(n, e.body, { httpMetadata: { contentType: t } }),
          await E.DB.prepare(
            "INSERT OR REPLACE INTO photo_access (key, user_id, token, created_at) VALUES (?, ?, ?, ?)",
          )
            .bind(n, i, s, Date.now())
            .run(),
          c({ key: n, token: s }, 200, m)
        );
      }
      if ("/photos" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = new URL(e.url).origin,
          a = await E.DB.prepare(
            "SELECT key, token, created_at FROM photo_access WHERE user_id = ? ORDER BY created_at DESC",
          )
            .bind(i)
            .all();
        return c(
          {
            photos: (a.results || []).map((e) => ({
              key: e.key,
              createdAt: e.created_at,
              url: `${t}/photo/${encodeURIComponent(e.key)}?token=${encodeURIComponent(e.token)}`,
            })),
          },
          200,
          m,
        );
      }
      if ("/photos/prune-unused" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        if (!E.PHOTOS)
          return c({ error: "Photo storage not configured" }, 503, m);
        const t = await E.DB.prepare(
            "SELECT data FROM user_data WHERE user_id = ?",
          )
            .bind(i)
            .first(),
          a = new Set();
        if (t && t.data)
          try {
            v(JSON.parse(t.data), a);
          } catch (e) {}
        const n = await E.DB.prepare(
          "SELECT key FROM photo_access WHERE user_id = ?",
        )
          .bind(i)
          .all();
        let s = 0;
        for (const e of n.results || [])
          e.key &&
            !a.has(e.key) &&
            (await E.PHOTOS.delete(e.key),
            await E.DB.prepare("DELETE FROM photo_access WHERE key = ?")
              .bind(e.key)
              .run(),
            s++);
        return c({ success: !0, deleted: s, kept: a.size }, 200, m);
      }
      if (p.startsWith("/photo/") && "GET" === e.method) {
        if (!E.PHOTOS)
          return c({ error: "Photo storage not configured" }, 503, m);
        const t = decodeURIComponent(p.slice(7)),
          a = await r(e, E),
          n = new URL(e.url).searchParams.get("token") || "";
        let s = !!(a && t.startsWith(a + "/"));
        if (!s && n) {
          const e = await E.DB.prepare(
            "SELECT user_id FROM photo_access WHERE key = ? AND token = ?",
          )
            .bind(t, n)
            .first();
          s = !!e;
        }
        if (!s)
          return c(
            { error: a ? "Forbidden" : "Unauthorized" },
            a ? 403 : 401,
            m,
          );
        const o = await E.PHOTOS.get(t);
        if (!o) return c({ error: "Not found" }, 404, m);
        const i = new Headers(m);
        return (
          i.set(
            "Content-Type",
            (o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg",
          ),
          i.set("Cache-Control", "private, no-store"),
          new Response(o.body, { status: 200, headers: i })
        );
      }
      if (p.startsWith("/photo/") && "DELETE" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        if (!E.PHOTOS)
          return c({ error: "Photo storage not configured" }, 503, m);
        const t = decodeURIComponent(p.slice(7));
        if (!t.startsWith(i + "/")) return c({ error: "Forbidden" }, 403, m);
        return (
          await E.PHOTOS.delete(t),
          await E.DB.prepare("DELETE FROM photo_access WHERE key = ?")
            .bind(t)
            .run(),
          c({ success: !0 }, 200, m)
        );
      }
      if ("/family" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ familyId: null, members: [] }, 200, m);
        const a = (
          await E.DB.prepare(
            "SELECT user_id, name, emoji, color FROM family_members WHERE family_id = ? ORDER BY joined ASC",
          )
            .bind(t.family_id)
            .all()
        ).results.map((e) => ({
          userId: e.user_id,
          name: e.name,
          emoji: e.emoji,
          color: e.color,
          isMe: e.user_id === i,
        }));
        return c({ familyId: t.family_id, members: a }, 200, m);
      }
      if ("/family/profile" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const { name: a, emoji: n, color: s } = await e.json(),
          o = await t(E, i, a, n, s);
        return (
          await E.DB.prepare(
            "UPDATE family_members SET name = ?, emoji = ?, color = ? WHERE user_id = ?",
          )
            .bind(d(a, 40) || "Me", d(n, 16) || "😊", d(s, 24) || "#ffcd57", i)
            .run(),
          c({ success: !0, familyId: o }, 200, m)
        );
      }
      if ("/family/invite" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const a = await e.json().catch(() => ({})),
          n = await t(E, i, a.name, a.emoji, a.color);
        const inviteEmail = String(a.email || "").trim().toLowerCase();
        if (
          inviteEmail &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inviteEmail)
        )
          return c({ error: "Enter a valid email address" }, 400, m);
        if (inviteEmail && !(await u(E, `finvite:${i}`, 8, 36e5)))
          return c(
            { error: "Too many invitations. Please wait before trying again." },
            429,
            m,
          );
        let s;
        await E.DB.prepare("DELETE FROM family_invites WHERE expires < ?")
          .bind(Date.now())
          .run();
        for (let e = 0; e < 5; e++) {
          s = o(6);
          if (
            !(await E.DB.prepare(
              "SELECT code FROM family_invites WHERE code = ?",
            )
              .bind(s)
              .first())
          )
            break;
        }
        const d = Date.now() + 9e5;
        return (
          await E.DB.prepare(
            "INSERT INTO family_invites (code, family_id, created, expires, invited_email, inviter_user_id) VALUES (?, ?, ?, ?, ?, ?)",
          )
            .bind(s, n, Date.now(), d, inviteEmail || null, i)
            .run(),
          inviteEmail &&
            (await sendDaysieEmail(E, {
              to: inviteEmail,
              ...familyInviteEmail({
                appUrl:
                  String(E.APP_URL || "").replace(/\/$/, "") ||
                  e.headers.get("Origin") ||
                  new URL(e.url).origin,
                code: s,
                inviterName: d(a.name, 40) || "A family member",
              }),
            })),
          c(
            {
              code: s,
              expires: d,
              emailSent: !!inviteEmail,
              invitedEmail: inviteEmail || null,
            },
            200,
            m,
          )
        );
      }
      if ("/family/join" === p && "POST" === e.method) {
        const i = e.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await u(E, "fjoin:" + i, 10, 6e4)))
          return c(
            { error: "Too many attempts. Please wait a minute." },
            429,
            m,
          );
        const t = await r(e, E);
        if (!t) return c({ error: "Unauthorized" }, 401, m);
        const { code: a, name: n, emoji: s, color: o } = await e.json(),
          p = (a || "").trim().toUpperCase();
        if (!p) return c({ error: "Missing code" }, 400, m);
        const f = await E.DB.prepare(
          "SELECT * FROM family_invites WHERE code = ?",
        )
          .bind(p)
          .first();
        if (!f || f.expires < Date.now())
          return (
            f &&
              (await E.DB.prepare("DELETE FROM family_invites WHERE code = ?")
                .bind(p)
                .run()),
            c({ error: "Invalid or expired code" }, 404, m)
          );
        await E.DB.prepare(
          "INSERT OR REPLACE INTO family_members (family_id, user_id, name, emoji, color, joined) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(
            f.family_id,
            t,
            d(n, 40) || "Me",
            d(s, 16) || "😊",
            d(o, 24) || "#ffcd57",
            Date.now(),
          )
          .run();
        const l = (
          await E.DB.prepare(
            "SELECT user_id, name, emoji, color FROM family_members WHERE family_id = ? ORDER BY joined ASC",
          )
            .bind(f.family_id)
            .all()
        ).results.map((e) => ({
          userId: e.user_id,
          name: e.name,
          emoji: e.emoji,
          color: e.color,
          isMe: e.user_id === t,
        }));
        return (
          await (async function (e, r, i, t) {
            try {
              const a = await e.DB.prepare(
                "SELECT user_id FROM family_members WHERE family_id = ? AND user_id != ?",
              )
                .bind(r, i)
                .all();
              for (const r of a.results) {
                const a = await e.DB.prepare(
                  "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
                )
                  .bind(r.user_id)
                  .first();
                if (!a) continue;
                const n = JSON.parse(a.subscription),
                  s = await w(e, n, {
                    title: "👨‍👩‍👧 " + (t || "Someone") + " joined your family",
                    body: "You can now share lists and assign tasks in Daysie.",
                    tag: "fam-join-" + i,
                    requireInteraction: !1,
                  });
                (404 !== s && 410 !== s) ||
                  (await e.DB.prepare(
                    "DELETE FROM push_subscriptions WHERE user_id = ?",
                  )
                    .bind(r.user_id)
                    .run());
              }
            } catch (e) {
              console.error("notifyFamilyJoined error:", e);
            }
          })(E, f.family_id, t, n || "Me"),
          c({ success: !0, familyId: f.family_id, members: l }, 200, m)
        );
      }
      if ("/family/leave" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id, name FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ success: !0, alreadyLeft: !0 }, 200, m);
        (await E.DB.prepare("DELETE FROM family_members WHERE user_id = ?")
          .bind(i)
          .run(),
          await E.DB.prepare(
            "UPDATE assigned_items SET status = 'done' WHERE (to_user = ? OR from_user = ?) AND status != 'done'",
          )
            .bind(i, i)
            .run());
        const a = await E.DB.prepare(
          "SELECT user_id FROM family_members WHERE family_id = ?",
        )
          .bind(t.family_id)
          .all();
        return (
          a.results.length
            ? await (async function (e, r, i, t) {
                try {
                  const a = await e.DB.prepare(
                    "SELECT user_id FROM family_members WHERE family_id = ?",
                  )
                    .bind(r)
                    .all();
                  for (const r of a.results) {
                    const a = await e.DB.prepare(
                      "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
                    )
                      .bind(r.user_id)
                      .first();
                    if (!a) continue;
                    const n = JSON.parse(a.subscription),
                      s = await w(e, n, {
                        title: "👋 " + (t || "Someone") + " left your family",
                        body: "Daysie updated your family roster.",
                        tag: "fam-left-" + i,
                        requireInteraction: !1,
                      });
                    (404 !== s && 410 !== s) ||
                      (await e.DB.prepare(
                        "DELETE FROM push_subscriptions WHERE user_id = ?",
                      )
                        .bind(r.user_id)
                        .run());
                  }
                } catch (e) {
                  console.error("notifyFamilyLeft error:", e);
                }
              })(E, t.family_id, i, t.name || "Someone")
            : (await E.DB.prepare("DELETE FROM family_data WHERE family_id = ?")
                .bind(t.family_id)
                .run(),
              await E.DB.prepare(
                "DELETE FROM family_invites WHERE family_id = ?",
              )
                .bind(t.family_id)
                .run()),
          c(
            { success: !0, familyId: t.family_id, remaining: a.results.length },
            200,
            m,
          )
        );
      }
      if ("/family/recover" === p && "POST" === e.method) {
        const i = e.headers.get("CF-Connecting-IP") || "unknown";
        if (!(await u(E, "frecover:" + i, 10, 6e4)))
          return c(
            { error: "Too many attempts. Please wait a minute." },
            429,
            m,
          );
        const t = await r(e, E);
        if (!t) return c({ error: "Unauthorized" }, 401, m);
        const {
          familyId: a,
          name: n,
          emoji: s,
          color: o,
        } = await e.json().catch(() => ({}));
        if (!a) return c({ error: "Missing familyId" }, 400, m);
        if (
          !(await E.DB.prepare(
            "SELECT family_id FROM family_members WHERE family_id = ? AND user_id = ?",
          )
            .bind(a, t)
            .first())
        )
          return c({ error: "Recovery requires a fresh invite" }, 403, m);
        await E.DB.prepare(
          "UPDATE family_members SET name = ?, emoji = ?, color = ? WHERE family_id = ? AND user_id = ?",
        )
          .bind(d(n, 40) || "Me", d(s, 16) || "😊", d(o, 24) || "#ffcd57", a, t)
          .run();
        const p = await E.DB.prepare(
          "SELECT user_id, name, emoji, color FROM family_members WHERE family_id = ? ORDER BY joined ASC",
        )
          .bind(a)
          .all();
        return c(
          {
            success: !0,
            familyId: a,
            members: p.results.map((e) => ({
              userId: e.user_id,
              name: e.name,
              emoji: e.emoji,
              color: e.color,
              isMe: e.user_id === t,
            })),
          },
          200,
          m,
        );
      }
      if ("/family/lists" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ lists: [], updated: 0 }, 200, m);
        const a = await E.DB.prepare(
          "SELECT lists, updated FROM family_data WHERE family_id = ?",
        )
          .bind(t.family_id)
          .first();
        return c(
          { lists: a ? JSON.parse(a.lists) : [], updated: a ? a.updated : 0 },
          200,
          m,
        );
      }
      if ("/family/lists" === p && "PUT" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ error: "Not in a family" }, 400, m);
        const { lists: a, action: s } = await e.json();
        if (JSON.stringify(a || []).length > 512e3)
          return c({ error: "Lists too large to sync" }, 413, m);
        const o = Date.now(),
          d = await E.DB.prepare(
            "SELECT lists FROM family_data WHERE family_id = ?",
          )
            .bind(t.family_id)
            .first(),
          u = (function (e, r) {
            const i = new Map();
            for (const r of e || [])
              r &&
                h(r.id) &&
                i.set(r.id, {
                  ...r,
                  items: Array.isArray(r.items) ? [...r.items] : [],
                });
            for (const e of r || []) {
              if (!e || !h(e.id)) continue;
              const r = i.get(e.id);
              !r || (e.updatedAt || 0) >= (r.updatedAt || 0)
                ? i.set(e.id, { ...r, ...e, items: n(r && r.items, e.items) })
                : i.set(e.id, { ...r, items: n(r.items, e.items) });
            }
            return [...i.values()].filter((e) => !e.deleted);
          })(d ? JSON.parse(d.lists || "[]") : [], a || []);
        return (
          await E.DB.prepare(
            "INSERT OR REPLACE INTO family_data (family_id, lists, updated) VALUES (?, ?, ?)",
          )
            .bind(t.family_id, JSON.stringify(u), o)
            .run(),
          await (async function (e, r, i, t) {
            try {
              const a = await e.DB.prepare(
                  "SELECT name FROM family_members WHERE user_id = ?",
                )
                  .bind(i)
                  .first(),
                n = a ? a.name : "Someone",
                s = await e.DB.prepare(
                  "SELECT user_id FROM family_members WHERE family_id = ? AND user_id != ?",
                )
                  .bind(r, i)
                  .all();
              for (const i of s.results) {
                const a = await e.DB.prepare(
                  "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
                )
                  .bind(i.user_id)
                  .first();
                if (!a) continue;
                const s = JSON.parse(a.subscription),
                  o = await w(e, s, {
                    title: "📝 Shared list updated",
                    body: n + " " + (t || "updated a shared list") + ".",
                    tag: "family-list-" + r,
                    requireInteraction: !1,
                    type: "family-list-updated",
                  });
                (404 !== o && 410 !== o) ||
                  (await e.DB.prepare(
                    "DELETE FROM push_subscriptions WHERE user_id = ?",
                  )
                    .bind(i.user_id)
                    .run());
              }
            } catch (e) {
              console.error("notifyFamilyListUpdated error:", e);
            }
          })(E, t.family_id, i, s || "updated a shared list"),
          c({ success: !0, updated: o, lists: u }, 200, m)
        );
      }
      if ("/family/assign" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ error: "Not in a family" }, 400, m);
        const { toUser: n, task: s } = await e.json();
        if (
          !(await E.DB.prepare(
            "SELECT user_id FROM family_members WHERE user_id = ? AND family_id = ?",
          )
            .bind(n, t.family_id)
            .first())
        )
          return c({ error: "Member not found" }, 404, m);
        const o = crypto.randomUUID(),
          d = Date.now();
        return (
          await E.DB.prepare(
            "INSERT INTO assigned_items (id, family_id, from_user, to_user, kind, payload, fire_at, status, notified, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(
              o,
              t.family_id,
              i,
              n,
              "task",
              JSON.stringify(s || {}),
              d,
              "pending",
              0,
              d,
            )
            .run(),
          await a(E, {
            id: o,
            to_user: n,
            from_user: i,
            kind: "task",
            payload: JSON.stringify(s || {}),
          }),
          c({ success: !0, id: o }, 200, m)
        );
      }
      if ("/family/remind" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
          "SELECT family_id FROM family_members WHERE user_id = ?",
        )
          .bind(i)
          .first();
        if (!t) return c({ error: "Not in a family" }, 400, m);
        const { toUser: n, title: s, fireAt: o } = await e.json();
        if (
          !(await E.DB.prepare(
            "SELECT user_id FROM family_members WHERE user_id = ? AND family_id = ?",
          )
            .bind(n, t.family_id)
            .first())
        )
          return c({ error: "Member not found" }, 404, m);
        const d = crypto.randomUUID(),
          u = Date.now(),
          p = o && o > u ? o : u,
          f = JSON.stringify({ title: s || "Reminder" });
        return (
          await E.DB.prepare(
            "INSERT INTO assigned_items (id, family_id, from_user, to_user, kind, payload, fire_at, status, notified, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(d, t.family_id, i, n, "reminder", f, p, "pending", 0, u)
            .run(),
          p <= u &&
            (await a(E, {
              id: d,
              to_user: n,
              from_user: i,
              kind: "reminder",
              payload: f,
            })),
          c({ success: !0, id: d }, 200, m)
        );
      }
      if ("/family/inbox" === p && "GET" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const t = await E.DB.prepare(
            "SELECT id, from_user, kind, payload, fire_at, status, created FROM assigned_items WHERE to_user = ? AND status != 'done' ORDER BY created DESC LIMIT 100",
          )
            .bind(i)
            .all(),
          a = [];
        for (const e of t.results) {
          const r = await E.DB.prepare(
            "SELECT name, emoji, color FROM family_members WHERE user_id = ?",
          )
            .bind(e.from_user)
            .first();
          a.push({
            id: e.id,
            kind: e.kind,
            payload: JSON.parse(e.payload),
            fireAt: e.fire_at,
            status: e.status,
            created: e.created,
            from: r ? { name: r.name, emoji: r.emoji, color: r.color } : null,
          });
        }
        return c({ items: a }, 200, m);
      }
      if ("/family/inbox/ack" === p && "POST" === e.method) {
        const i = await r(e, E);
        if (!i) return c({ error: "Unauthorized" }, 401, m);
        const { id: t, status: a } = await e.json();
        return (
          await E.DB.prepare(
            "UPDATE assigned_items SET status = ? WHERE id = ? AND to_user = ?",
          )
            .bind(a || "done", t, i)
            .run(),
          c({ success: !0 }, 200, m)
        );
      }
      return c({ error: "Not found" }, 404, m);
    } catch (e) {
      return (
        console.error("Worker error:", e),
        c({ error: e.message || "Internal server error" }, 500, m)
      );
    }
  },
  async scheduled(e, r, t) {
    try {
      await i(r);
      const e = Date.now(),
        t = await r.DB.prepare("SELECT user_id, data FROM user_data").all();
      for (const { user_id: i, data: a } of t.results) {
        const t = JSON.parse(a),
          n = t.profiles || [];
        for (const t of n) {
          const a = t.tasks || [];
          for (const s of a)
            if (!s.done && s.due && s.due <= e && !s.notified) {
              const e = await r.DB.prepare(
                "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
              )
                .bind(i)
                .first();
              if (e) {
                const a = JSON.parse(e.subscription),
                  o = s.assignee ? n.find((e) => e.id === s.assignee) : null,
                  d = o && o.id !== t.id ? `For ${o.name}: ` : "",
                  u = await w(r, a, {
                    title: "⏰ " + s.title,
                    body: d + (s.note || "Reminder time!"),
                    tag: s.id,
                    requireInteraction: "high" === s.priority,
                  });
                ((404 !== u && 410 !== u) ||
                  (await r.DB.prepare(
                    "DELETE FROM push_subscriptions WHERE user_id = ?",
                  )
                    .bind(i)
                    .run()),
                  u >= 200 && u < 500 && (s.notified = !0));
              }
            }
        }
        await r.DB.prepare(
          "UPDATE user_data SET data = ?, updated_at = ? WHERE user_id = ?",
        )
          .bind(JSON.stringify(t), e, i)
          .run();
      }
      const n = await r.DB.prepare(
        "SELECT id, to_user, from_user, kind, payload FROM assigned_items WHERE notified = 0 AND status = 'pending' AND fire_at <= ?",
      )
        .bind(e)
        .all();
      for (const e of n.results) {
        (await r.DB.prepare(
          "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
        )
          .bind(e.to_user)
          .first())
          ? await a(r, e)
          : await r.DB.prepare(
              "UPDATE assigned_items SET notified = 1 WHERE id = ?",
            )
              .bind(e.id)
              .run();
      }
    } catch (e) {
      console.error("Scheduled push error:", e);
    }
  },
};
async function r(e, r) {
  const i = e.headers.get("Authorization");
  if (!i || !i.startsWith("Bearer ")) return null;
  const t = i.substring(7),
    a = await r.DB.prepare(
      "SELECT user_id, expires FROM sessions WHERE token = ?",
    )
      .bind(t)
      .first();
  if (a && a.expires >= Date.now()) return a.user_id;
  if (!r.BETTER_AUTH_SECRET) return null;
  try {
    const authSession = await createDaysieAuth(r, e).api.getSession({
      headers: e.headers,
    });
    return authSession?.user?.id || null;
  } catch (error) {
    console.error("Better Auth session lookup failed", error);
    return null;
  }
}
async function i(r) {
  if (e) return;
  await r.DB.batch([
    r.DB.prepare(
      "CREATE TABLE IF NOT EXISTS family_members (family_id TEXT, user_id TEXT PRIMARY KEY, name TEXT, emoji TEXT, color TEXT, joined INTEGER)",
    ),
    r.DB.prepare(
      "CREATE TABLE IF NOT EXISTS family_invites (code TEXT PRIMARY KEY, family_id TEXT, created INTEGER, expires INTEGER)",
    ),
    r.DB.prepare(
      "CREATE TABLE IF NOT EXISTS family_data (family_id TEXT PRIMARY KEY, lists TEXT, updated INTEGER)",
    ),
    r.DB.prepare(
      "CREATE TABLE IF NOT EXISTS assigned_items (id TEXT PRIMARY KEY, family_id TEXT, from_user TEXT, to_user TEXT, kind TEXT, payload TEXT, fire_at INTEGER, status TEXT, notified INTEGER, created INTEGER)",
    ),
    r.DB.prepare(
      "CREATE TABLE IF NOT EXISTS photo_access (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL, created_at INTEGER NOT NULL)",
    ),
  ]);
  try {
    await r.DB.prepare(
      "ALTER TABLE pair_codes ADD COLUMN redeem_nonce TEXT",
    ).run();
  } catch (r) {}
  try {
    await r.DB.prepare(
      "ALTER TABLE pair_codes ADD COLUMN session_token TEXT",
    ).run();
  } catch (r) {}
  try {
    await r.DB.prepare(
      "ALTER TABLE family_invites ADD COLUMN invited_email TEXT",
    ).run();
  } catch (r) {}
  try {
    await r.DB.prepare(
      "ALTER TABLE family_invites ADD COLUMN inviter_user_id TEXT",
    ).run();
  } catch (r) {}
  e = !0;
}
async function t(e, r, i, t, a) {
  const n = await e.DB.prepare(
    "SELECT family_id FROM family_members WHERE user_id = ?",
  )
    .bind(r)
    .first();
  if (n) return n.family_id;
  const s = crypto.randomUUID();
  return (
    await e.DB.prepare(
      "INSERT INTO family_members (family_id, user_id, name, emoji, color, joined) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        s,
        r,
        d(i, 40) || "Me",
        d(t, 16) || "😊",
        d(a, 24) || "#ffcd57",
        Date.now(),
      )
      .run(),
    s
  );
}
async function a(e, r) {
  try {
    const i = await e.DB.prepare(
      "SELECT subscription FROM push_subscriptions WHERE user_id = ?",
    )
      .bind(r.to_user)
      .first();
    if (!i) return;
    const t = JSON.parse(i.subscription),
      a = JSON.parse(r.payload || "{}"),
      n = await e.DB.prepare(
        "SELECT name FROM family_members WHERE user_id = ?",
      )
        .bind(r.from_user)
        .first(),
      s = n ? n.name : "Family",
      o =
        "reminder" === r.kind
          ? "🔔 " + (a.title || "Reminder")
          : "📋 " + (a.title || "New task"),
      d = "reminder" === r.kind ? "From " + s : s + " assigned you a task",
      u = await w(e, t, {
        title: o,
        body: d,
        tag: r.id,
        requireInteraction: !1,
      });
    ((404 !== u && 410 !== u) ||
      (await e.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?")
        .bind(r.to_user)
        .run()),
      u >= 200 &&
        u < 500 &&
        (await e.DB.prepare(
          "UPDATE assigned_items SET notified = 1 WHERE id = ?",
        )
          .bind(r.id)
          .run()));
  } catch (e) {
    console.error("pushAssignedItem error:", e);
  }
}
function n(e, r) {
  const i = new Map();
  for (const r of e || []) r && h(r.id) && i.set(r.id, { ...r });
  for (const e of r || []) {
    if (!e || !h(e.id)) continue;
    const r = i.get(e.id);
    (!r || (e.updatedAt || 0) >= (r.updatedAt || 0)) &&
      i.set(e.id, { ...r, ...e });
  }
  return [...i.values()].filter((e) => !e.deleted);
}
async function s(e, r) {
  const i = crypto.randomUUID(),
    t = Date.now() + 2592e6;
  return (
    await e.DB.prepare(
      "INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)",
    )
      .bind(i, r, t)
      .run(),
    i
  );
}
function o(e = 6) {
  const r = "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
    i = crypto.getRandomValues(new Uint8Array(e));
  let t = "";
  for (let a = 0; a < e; a++) t += r[i[a] % 32];
  return t;
}
function d(e, r) {
  return String(null == e ? "" : e)
    .replace(/[<>]/g, "")
    .slice(0, r);
}
function h(e) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(e || ""));
}
function v(e, r) {
  if (Array.isArray(e)) return void e.forEach((e) => v(e, r));
  if (e && "object" == typeof e)
    return void Object.values(e).forEach((e) => v(e, r));
  if ("string" != typeof e || e.startsWith("data:")) return;
  try {
    const i = new URL(e),
      t = "/photo/",
      a = i.pathname.indexOf(t);
    if (a >= 0) {
      const e = decodeURIComponent(i.pathname.slice(a + t.length));
      e && r.add(e);
    }
  } catch (e) {}
}
async function u(e, r, i, t) {
  const a = Date.now(),
    n = await e.DB.prepare("SELECT count, reset FROM rate_limits WHERE k = ?")
      .bind(r)
      .first();
  return !n || n.reset < a
    ? (await e.DB.prepare(
        "INSERT OR REPLACE INTO rate_limits (k, count, reset) VALUES (?, ?, ?)",
      )
        .bind(r, 1, a + t)
        .run(),
      !0)
    : !(n.count >= i) &&
        (await e.DB.prepare(
          "UPDATE rate_limits SET count = count + 1 WHERE k = ?",
        )
          .bind(r)
          .run(),
        !0);
}
function c(e, r = 200, i = {}) {
  return new Response(JSON.stringify(e), {
    status: r,
    headers: { "Content-Type": "application/json", ...i },
  });
}
async function verifyTurnstileToken(env, token) {
  if (!env.TURNSTILE_VERIFY_URL)
    return { success: false, "error-codes": ["verification-not-configured"] };
  try {
    const response = await fetch(env.TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return await response.json();
  } catch {
    return { success: false, "error-codes": ["verification-unavailable"] };
  }
}
function isSafePushEndpoint(e) {
  try {
    const r = new URL(e && e.endpoint),
      i = r.hostname.toLowerCase(),
      t = [
        "fcm.googleapis.com",
        "android.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ];
    return (
      "https:" === r.protocol &&
      (t.includes(i) ||
        i.endsWith(".push.apple.com") ||
        i.endsWith(".notify.windows.com"))
    );
  } catch (e) {
    return !1;
  }
}
function g(e) {
  return !!(
    e &&
    e.meta &&
    ((e.meta.changes || 0) > 0 || (e.meta.rows_written || 0) > 0)
  );
}
const E =
  "BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU";
function p(e) {
  const r = (e = String(e).replace(/-/g, "+").replace(/_/g, "/")).length % 4;
  r && (e += "=".repeat(4 - r));
  const i = atob(e),
    t = new Uint8Array(i.length);
  for (let e = 0; e < i.length; e++) t[e] = i.charCodeAt(e);
  return t;
}
function m(e) {
  const r = new Uint8Array(e);
  let i = "";
  for (let e = 0; e < r.length; e++) i += String.fromCharCode(r[e]);
  return btoa(i).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function f(...e) {
  let r = 0;
  for (const i of e) r += i.length;
  const i = new Uint8Array(r);
  let t = 0;
  for (const r of e) (i.set(r, t), (t += r.length));
  return i;
}
async function l(e, r) {
  const i = await crypto.subtle.importKey(
    "raw",
    e,
    { name: "HMAC", hash: "SHA-256" },
    !1,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", i, r));
}
async function y(e, r, i, t) {
  const a = await l(e, r);
  return (await l(a, f(i, new Uint8Array([1])))).slice(0, t);
}
async function _(e, r) {
  const i = (e) => m(new TextEncoder().encode(JSON.stringify(e))),
    t = {
      aud: r,
      exp: Math.floor(Date.now() / 1e3) + 43200,
      sub: e.VAPID_SUBJECT || "mailto:notify@daysie.app",
    },
    a = i({ typ: "JWT", alg: "ES256" }) + "." + i(t),
    n = await (async function (e) {
      const r = p(e.VAPID_PUBLIC_KEY || E),
        i = String(e.VAPID_PRIVATE_KEY)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
        t = {
          kty: "EC",
          crv: "P-256",
          x: m(r.slice(1, 33)),
          y: m(r.slice(33, 65)),
          d: i,
          ext: !0,
        };
      return crypto.subtle.importKey(
        "jwk",
        t,
        { name: "ECDSA", namedCurve: "P-256" },
        !1,
        ["sign"],
      );
    })(e),
    s = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      n,
      new TextEncoder().encode(a),
    );
  return a + "." + m(new Uint8Array(s));
}
async function w(e, r, i) {
  try {
    if (!e.VAPID_PRIVATE_KEY)
      return (
        console.error("Push send error: VAPID_PRIVATE_KEY secret is not set"),
        0
      );
    if (!isSafePushEndpoint(r))
      return (console.error("Push send error: invalid push endpoint"), 0);
    const t = r.endpoint,
      a = new URL(t).origin,
      n = await _(e, a),
      s = await (async function (e, r) {
        const i = new TextEncoder(),
          t = p(e.keys.p256dh),
          a = p(e.keys.auth),
          n = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            !0,
            ["deriveBits"],
          ),
          s = new Uint8Array(await crypto.subtle.exportKey("raw", n.publicKey)),
          o = await crypto.subtle.importKey(
            "raw",
            t,
            { name: "ECDH", namedCurve: "P-256" },
            !1,
            [],
          ),
          d = new Uint8Array(
            await crypto.subtle.deriveBits(
              { name: "ECDH", public: o },
              n.privateKey,
              256,
            ),
          ),
          u = await l(a, d),
          c = f(i.encode("WebPush: info"), new Uint8Array([0]), t, s),
          E = (await l(u, f(c, new Uint8Array([1])))).slice(0, 32),
          m = crypto.getRandomValues(new Uint8Array(16)),
          _ = await y(m, E, i.encode("Content-Encoding: aes128gcm\0"), 16),
          w = await y(m, E, i.encode("Content-Encoding: nonce\0"), 12),
          T = f(r, new Uint8Array([2])),
          R = await crypto.subtle.importKey("raw", _, { name: "AES-GCM" }, !1, [
            "encrypt",
          ]),
          D = new Uint8Array(
            await crypto.subtle.encrypt(
              { name: "AES-GCM", iv: w, tagLength: 128 },
              R,
              T,
            ),
          );
        return f(
          m,
          new Uint8Array([0, 0, 16, 0]),
          new Uint8Array([s.length]),
          s,
          D,
        );
      })(r, new TextEncoder().encode(JSON.stringify(i)));
    return (
      await fetch(t, {
        method: "POST",
        headers: {
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
          Authorization: "vapid t=" + n + ", k=" + (e.VAPID_PUBLIC_KEY || E),
        },
        body: s,
      })
    ).status;
  } catch (e) {
    return (console.error("Push send error:", e), 0);
  }
}
