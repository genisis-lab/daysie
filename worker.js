// Cloudflare Worker - Device pairing auth + Sync + Scheduled push
// Deploy this to Cloudflare Workers and bind a D1 database named "DB".
//
// Auth model: NO email. The first device turns on sync (/account/create).
// Extra devices are linked with a short code, with an approve-on-source-device
// confirmation step before the new device is allowed in.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ACCOUNT: create a fresh account on the first device (no email needed)
      if (path === '/account/create' && request.method === 'POST') {
        const userId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)')
          .bind(userId, Date.now())
          .run();
        const token = await newSession(env, userId);
        return json({ token, userId }, 200, corsHeaders);
      }

      // PAIR: source device creates a short-lived code to link another device
      if (path === '/pair/create' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        // Only one active code per account
        await env.DB.prepare('DELETE FROM pair_codes WHERE user_id = ?').bind(userId).run();

        let code;
        for (let i = 0; i < 5; i++) {
          code = genCode(6);
          const exists = await env.DB.prepare('SELECT code FROM pair_codes WHERE code = ?').bind(code).first();
          if (!exists) break;
        }
        const expires = Date.now() + 3 * 60 * 1000; // 3 minutes

        await env.DB.prepare('INSERT INTO pair_codes (code, user_id, expires, attempts, redeemed, approved) VALUES (?, ?, ?, 0, 0, 0)')
          .bind(code, userId, expires)
          .run();

        return json({ code, expires }, 200, corsHeaders);
      }

      // PAIR: new device submits a code (does NOT sign in yet - needs approval)
      if (path === '/pair/redeem' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const allowed = await checkRateLimit(env, 'redeem:' + ip, 10, 60 * 1000);
        if (!allowed) return json({ error: 'Too many attempts. Please wait a minute.' }, 429, corsHeaders);

        const { code } = await request.json();
        const norm = (code || '').trim().toUpperCase();
        if (!norm) return json({ error: 'Missing code' }, 400, corsHeaders);

        const row = await env.DB.prepare('SELECT * FROM pair_codes WHERE code = ?').bind(norm).first();
        if (!row || row.expires < Date.now()) {
          if (row) await env.DB.prepare('DELETE FROM pair_codes WHERE code = ?').bind(norm).run();
          return json({ error: 'Invalid or expired code' }, 404, corsHeaders);
        }

        const attempts = (row.attempts || 0) + 1;
        if (attempts > 5) {
          await env.DB.prepare('DELETE FROM pair_codes WHERE code = ?').bind(norm).run();
          return json({ error: 'Too many attempts' }, 429, corsHeaders);
        }

        await env.DB.prepare('UPDATE pair_codes SET attempts = ?, redeemed = 1 WHERE code = ?')
          .bind(attempts, norm)
          .run();

        return json({ status: 'pending' }, 200, corsHeaders);
      }

      // PAIR: source device checks whether a device is waiting for approval
      if (path === '/pair/pending' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const row = await env.DB.prepare('SELECT code FROM pair_codes WHERE user_id = ? AND redeemed = 1 AND approved = 0 AND expires > ?')
          .bind(userId, Date.now())
          .first();

        return json({ pending: !!row, code: row ? row.code : null }, 200, corsHeaders);
      }

      // PAIR: source device approves the waiting device (issues its session)
      if (path === '/pair/approve' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const { code } = await request.json();
        const norm = (code || '').trim().toUpperCase();

        const row = await env.DB.prepare('SELECT * FROM pair_codes WHERE code = ? AND user_id = ?')
          .bind(norm, userId)
          .first();
        if (!row || row.expires < Date.now()) return json({ error: 'Invalid or expired code' }, 404, corsHeaders);

        const token = await newSession(env, userId);
        await env.DB.prepare('UPDATE pair_codes SET approved = 1, session_token = ? WHERE code = ?')
          .bind(token, norm)
          .run();

        return json({ success: true }, 200, corsHeaders);
      }

      // PAIR: source device denies the waiting device
      if (path === '/pair/deny' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const { code } = await request.json();
        const norm = (code || '').trim().toUpperCase();
        await env.DB.prepare('DELETE FROM pair_codes WHERE code = ? AND user_id = ?').bind(norm, userId).run();

        return json({ success: true }, 200, corsHeaders);
      }

      // PAIR: new device polls for approval, then receives its session token
      if (path === '/pair/status' && request.method === 'POST') {
        const { code } = await request.json();
        const norm = (code || '').trim().toUpperCase();

        const row = await env.DB.prepare('SELECT * FROM pair_codes WHERE code = ?').bind(norm).first();
        if (!row) return json({ status: 'gone' }, 200, corsHeaders);
        if (row.expires < Date.now()) {
          await env.DB.prepare('DELETE FROM pair_codes WHERE code = ?').bind(norm).run();
          return json({ status: 'expired' }, 200, corsHeaders);
        }
        if (row.approved === 1 && row.session_token) {
          const token = row.session_token;
          const pairedUserId = row.user_id;
          await env.DB.prepare('DELETE FROM pair_codes WHERE code = ?').bind(norm).run();
          return json({ status: 'approved', token, userId: pairedUserId }, 200, corsHeaders);
        }
        return json({ status: 'pending' }, 200, corsHeaders);
      }

      // DATA: Get user data
      if (path === '/data' && request.method === 'GET') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const row = await env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(userId).first();
        if (!row) return json({ profiles: [] }, 200, corsHeaders);

        return json(JSON.parse(row.data), 200, corsHeaders);
      }

      // DATA: Save user data
      if (path === '/data' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const body = await request.json();
        const data = JSON.stringify(body);

        await env.DB.prepare('INSERT OR REPLACE INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)')
          .bind(userId, data, Date.now())
          .run();

        return json({ success: true }, 200, corsHeaders);
      }

      // PUSH: Subscribe to push notifications
      if (path === '/push/subscribe' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);

        const subscription = await request.json();

        await env.DB.prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, subscription, created_at) VALUES (?, ?, ?)')
          .bind(userId, JSON.stringify(subscription), Date.now())
          .run();

        return json({ success: true }, 200, corsHeaders);
      }

      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('Worker error:', error);
      return json({ error: error.message || 'Internal server error' }, 500, corsHeaders);
    }
  },

  // Scheduled push notifications (run every minute via Cron Trigger)
  async scheduled(event, env, ctx) {
    try {
      const now = Date.now();
      const users = await env.DB.prepare('SELECT user_id, data FROM user_data').all();

      for (const { user_id, data } of users.results) {
        const userData = JSON.parse(data);
        const profiles = userData.profiles || [];

        for (const profile of profiles) {
          const tasks = profile.tasks || [];

          for (const task of tasks) {
            if (!task.done && task.due && task.due <= now && !task.notified) {
              const subRow = await env.DB.prepare('SELECT subscription FROM push_subscriptions WHERE user_id = ?')
                .bind(user_id)
                .first();

              if (subRow) {
                const subscription = JSON.parse(subRow.subscription);
                await sendPushNotification(subscription, {
                  title: '⏰ ' + task.title,
                  body: task.note || 'Reminder time!',
                  tag: task.id,
                  requireInteraction: task.priority === 'high',
                });
                task.notified = true;
              }
            }
          }
        }

        await env.DB.prepare('UPDATE user_data SET data = ?, updated_at = ? WHERE user_id = ?')
          .bind(JSON.stringify(userData), now, user_id)
          .run();
      }
    } catch (error) {
      console.error('Scheduled push error:', error);
    }
  },
};

// Helper: Get user ID from Authorization header
async function getUserFromAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const session = await env.DB.prepare('SELECT user_id, expires FROM sessions WHERE token = ?').bind(token).first();

  if (!session || session.expires < Date.now()) return null;

  return session.user_id;
}

// Helper: create a new 30-day session for a user
async function newSession(env, userId) {
  const token = crypto.randomUUID();
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)')
    .bind(token, userId, expires)
    .run();
  return token;
}

// Helper: generate a short, human-friendly pairing code.
// Crockford base32 alphabet with no confusing 0/O/1/I/L/U characters.
function genCode(len = 6) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Helper: simple per-key fixed-window rate limiter backed by D1
async function checkRateLimit(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, reset FROM rate_limits WHERE k = ?').bind(key).first();
  if (!row || row.reset < now) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (k, count, reset) VALUES (?, ?, ?)')
      .bind(key, 1, now + windowMs)
      .run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE k = ?').bind(key).run();
  return true;
}

// Helper: JSON response
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Helper: Send Web Push notification
async function sendPushNotification(subscription, payload) {
  try {
    const webpush = await import('web-push');
    webpush.setVapidDetails(
      'mailto:you@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (error) {
    console.error('Push send error:', error);
  }
}
