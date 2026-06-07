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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

      // PHOTO: upload a journal photo to R2 object storage (auth required).
      // Photos are too large to live in D1 (SQLITE_TOOBIG), so the bytes go to
      // R2 and only a small key is stored in the synced JSON.
      if (path === '/photo' && request.method === 'POST') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);
        if (!env.PHOTOS) return json({ error: 'Photo storage not configured' }, 503, corsHeaders);
        const contentType = request.headers.get('Content-Type') || 'image/jpeg';
        const key = `${userId}/${crypto.randomUUID()}`;
        await env.PHOTOS.put(key, request.body, { httpMetadata: { contentType } });
        return json({ key }, 200, corsHeaders);
      }

      // PHOTO: fetch a stored photo. The key embeds an unguessable UUID, so it is
      // served without auth (an <img> tag cannot send an Authorization header).
      if (path.startsWith('/photo/') && request.method === 'GET') {
        if (!env.PHOTOS) return json({ error: 'Photo storage not configured' }, 503, corsHeaders);
        const key = decodeURIComponent(path.slice('/photo/'.length));
        const obj = await env.PHOTOS.get(key);
        if (!obj) return json({ error: 'Not found' }, 404, corsHeaders);
        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(obj.body, { status: 200, headers });
      }

      // PHOTO: delete a stored photo (auth required; may only touch your own keys).
      if (path.startsWith('/photo/') && request.method === 'DELETE') {
        const userId = await getUserFromAuth(request, env);
        if (!userId) return json({ error: 'Unauthorized' }, 401, corsHeaders);
        if (!env.PHOTOS) return json({ error: 'Photo storage not configured' }, 503, corsHeaders);
        const key = decodeURIComponent(path.slice('/photo/'.length));
        if (!key.startsWith(userId + '/')) return json({ error: 'Forbidden' }, 403, corsHeaders);
        await env.PHOTOS.delete(key);
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
                const assignee = task.assignee ? profiles.find((p) => p.id === task.assignee) : null;
                const prefix = assignee && assignee.id !== profile.id ? `For ${assignee.name}: ` : '';
                const status = await sendPushNotification(env, subscription, {
                  title: '⏰ ' + task.title,
                  body: prefix + (task.note || 'Reminder time!'),
                  tag: task.id,
                  requireInteraction: task.priority === 'high',
                });
                // 404/410 = subscription is gone; stop trying to use it.
                if (status === 404 || status === 410) {
                  await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(user_id).run();
                }
                // Mark as notified on success or any permanent client error so we
                // don't re-send every minute. Transient (0/5xx) errors retry later.
                if (status >= 200 && status < 500) task.notified = true;
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

// ===========================================================================
// Web Push (VAPID + aes128gcm) implemented with the WebCrypto API only.
// The `web-push` npm package does NOT run in the Cloudflare Workers runtime,
// so we build the request by hand following RFC 8291 (encryption) and the
// VAPID spec (RFC 8292). This sends real push messages that wake the device
// even when Daysie is closed.
// ===========================================================================

// Fallback public key (matches the key baked into the front-end). The private
// key MUST be provided as a Worker secret: VAPID_PRIVATE_KEY.
const VAPID_PUBLIC_FALLBACK = 'BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU';

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes) {
  const b = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

// Single-block HKDF (output length <= 32 bytes), as used by Web Push.
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const out = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return out.slice(0, length);
}

async function importVapidSigningKey(env) {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY || VAPID_PUBLIC_FALLBACK);
  const d = String(env.VAPID_PRIVATE_KEY).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d,
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function createVapidJWT(env, audience) {
  const enc = (obj) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:notify@daysie.app',
  };
  const unsigned = enc(header) + '.' + enc(payload);
  const key = await importVapidSigningKey(env);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + bytesToB64url(new Uint8Array(sig));
}

// RFC 8291 aes128gcm encryption of the push payload.
async function encryptPayload(subscription, payloadBytes) {
  const te = new TextEncoder();
  const uaPublic = b64urlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes

  // Ephemeral application-server ECDH key pair.
  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey)); // 65 bytes

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256));

  // Derive the input keying material (RFC 8291 §3.4).
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBytes(te.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublicRaw);
  const ikm = (await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])))).slice(0, 32);

  // Content-encryption key + nonce (RFC 8188).
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  // Single record: payload followed by the 0x02 last-record delimiter.
  const plaintext = concatBytes(payloadBytes, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext));

  // aes128gcm header: salt(16) | rs(4, big-endian) | idlen(1) | keyid | ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  const idlen = new Uint8Array([asPublicRaw.length]);
  return concatBytes(salt, rs, idlen, asPublicRaw, ciphertext);
}

// Helper: Send a Web Push notification. Returns the HTTP status code (or 0 on error).
async function sendPushNotification(env, subscription, payload) {
  try {
    if (!env.VAPID_PRIVATE_KEY) {
      console.error('Push send error: VAPID_PRIVATE_KEY secret is not set');
      return 0;
    }
    const endpoint = subscription.endpoint;
    const audience = new URL(endpoint).origin;
    const jwt = await createVapidJWT(env, audience);
    const body = await encryptPayload(subscription, new TextEncoder().encode(JSON.stringify(payload)));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        'Authorization': 'vapid t=' + jwt + ', k=' + (env.VAPID_PUBLIC_KEY || VAPID_PUBLIC_FALLBACK),
      },
      body,
    });
    return res.status;
  } catch (error) {
    console.error('Push send error:', error);
    return 0;
  }
}
