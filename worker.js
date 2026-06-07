// Cloudflare Worker - Magic-link auth + Sync + Scheduled push
// Deploy this to Cloudflare Workers and bind a D1 database named "DB"

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // AUTH: Request magic link
      if (path === '/auth/request' && request.method === 'POST') {
        const { email } = await request.json();
        if (!email || !email.includes('@')) {
          return json({ error: 'Invalid email' }, 400, corsHeaders);
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Store code in KV or D1
        await env.DB.prepare('INSERT OR REPLACE INTO auth_codes (email, code, expires) VALUES (?, ?, ?)')
          .bind(email, code, expires)
          .run();

        // Send email (using MailChannels or similar)
        await sendEmail(env, email, code);

        return json({ success: true }, 200, corsHeaders);
      }

      // AUTH: Verify code
      if (path === '/auth/verify' && request.method === 'POST') {
        const { email, code } = await request.json();
        if (!email || !code) {
          return json({ error: 'Missing email or code' }, 400, corsHeaders);
        }

        const row = await env.DB.prepare('SELECT * FROM auth_codes WHERE email = ? AND code = ?')
          .bind(email, code)
          .first();

        if (!row || row.expires < Date.now()) {
          return json({ error: 'Invalid or expired code' }, 401, corsHeaders);
        }

        // Generate session token
        const token = crypto.randomUUID();
        const tokenExpires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

        // Create or get user
        let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        if (!user) {
          await env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
            .bind(crypto.randomUUID(), email, Date.now())
            .run();
          user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        }

        // Store session
        await env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)')
          .bind(token, user.id, tokenExpires)
          .run();

        // Delete used code
        await env.DB.prepare('DELETE FROM auth_codes WHERE email = ? AND code = ?').bind(email, code).run();

        return json({ token, user: { id: user.id, email: user.email } }, 200, corsHeaders);
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
      return json({ error: 'Internal server error' }, 500, corsHeaders);
    }
  },

  // Scheduled push notifications (run every minute via Cron Trigger)
  async scheduled(event, env, ctx) {
    try {
      const now = Date.now();

      // Get all user data and check for due reminders
      const users = await env.DB.prepare('SELECT user_id, data FROM user_data').all();

      for (const { user_id, data } of users.results) {
        const userData = JSON.parse(data);
        const profiles = userData.profiles || [];

        for (const profile of profiles) {
          const tasks = profile.tasks || [];

          for (const task of tasks) {
            // Check if task is due and not yet notified
            if (!task.done && task.due && task.due <= now && !task.notified) {
              // Get push subscription
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

                // Mark as notified (update user data)
                task.notified = true;
              }
            }
          }
        }

        // Save updated data
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

// Helper: JSON response
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Helper: Send email via MailChannels
async function sendEmail(env, email, code) {
  try {
    const emailBody = {
      personalizations: [{ to: [{ email }] }],
      from: { email: 'noreply@daysie.app', name: 'Daysie' },
      subject: 'Your Daysie sign-in code',
      content: [
        {
          type: 'text/plain',
          value: `Hi!\n\nYour Daysie sign-in code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\n🌼 Daysie`,
        },
      ],
    };

    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });
  } catch (error) {
    console.error('Email send error:', error);
    // Don't throw - continue even if email fails
  }
}

// Helper: Send Web Push notification
async function sendPushNotification(subscription, payload) {
  // This requires VAPID keys and the web-push library
  // For Cloudflare Workers, you'd use a Web Push service or implement VAPID signing
  // Simplified placeholder:
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
