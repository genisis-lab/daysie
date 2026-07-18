-- Daysie Database Schema for Cloudflare D1
-- Apply: npx wrangler d1 execute daysie-db --remote --file=schema.sql
--
-- Daysie uses DEVICE PAIRING (no email). If you previously created the old
-- email-based tables, reset the changed/removed ones ONCE before applying:
--   npx wrangler d1 execute daysie-db --remote --command "DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS auth_codes; DROP TABLE IF EXISTS pair_codes; DROP TABLE IF EXISTS rate_limits;"
-- (This is safe early on since there is no real account data yet.)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Better Auth keeps its managed email/password identities in singular tables.
-- The original plural tables above remain in place for backwards-compatible
-- device-pairing sessions.
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  twoFactorEnabled INTEGER NOT NULL DEFAULT 0,
  username TEXT,
  displayUsername TEXT,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_better_session_user ON "session"(userId);
CREATE INDEX IF NOT EXISTS idx_better_account_user ON account(userId);
CREATE INDEX IF NOT EXISTS idx_better_verification_identifier ON verification(identifier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_better_user_username ON "user"(username);

CREATE TABLE IF NOT EXISTS "twoFactor" (
  id TEXT PRIMARY KEY NOT NULL,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 1,
  failedVerificationCount INTEGER NOT NULL DEFAULT 0,
  lockedUntil INTEGER
);
CREATE INDEX IF NOT EXISTS idx_two_factor_secret ON "twoFactor"(secret);
CREATE INDEX IF NOT EXISTS idx_two_factor_user ON "twoFactor"(userId);

-- Short-lived device pairing codes with approve-on-source-device handshake.
-- redeemed: a new device has entered the code and is waiting.
-- approved: the source device approved; session_token is then handed out.
CREATE TABLE IF NOT EXISTS pair_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  redeemed INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  redeem_nonce TEXT,
  session_token TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Simple per-IP rate limiting (used by the pairing redeem endpoint).
CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS user_data_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_version_revision ON user_data_versions(user_id, revision);
CREATE INDEX IF NOT EXISTS idx_user_data_versions_user ON user_data_versions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS photo_access (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_pair_codes_user ON pair_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_pair_codes_expires ON pair_codes(expires);
CREATE INDEX IF NOT EXISTS idx_photo_access_user ON photo_access(user_id);


CREATE TABLE IF NOT EXISTS family_members (
  family_id TEXT,
  user_id TEXT PRIMARY KEY,
  name TEXT,
  emoji TEXT,
  color TEXT,
  joined INTEGER,
  availability TEXT DEFAULT 'free',
  availability_until INTEGER
);
CREATE TABLE IF NOT EXISTS family_invites (
  code TEXT PRIMARY KEY,
  family_id TEXT,
  created INTEGER,
  expires INTEGER,
  invited_email TEXT,
  inviter_user_id TEXT
);
CREATE TABLE IF NOT EXISTS family_data (
  family_id TEXT PRIMARY KEY,
  lists TEXT,
  updated INTEGER
);
CREATE TABLE IF NOT EXISTS assigned_items (
  id TEXT PRIMARY KEY,
  family_id TEXT,
  from_user TEXT,
  to_user TEXT,
  kind TEXT,
  payload TEXT,
  fire_at INTEGER,
  status TEXT,
  notified INTEGER,
  created INTEGER
);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_assigned_to ON assigned_items(to_user, status);
CREATE INDEX IF NOT EXISTS idx_assigned_due ON assigned_items(notified, status, fire_at);

CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL UNIQUE,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey(userId);
CREATE TABLE IF NOT EXISTS device_labels (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_device_labels_user ON device_labels(user_id);
CREATE TABLE IF NOT EXISTS recovery_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, used_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id, used_at);
CREATE TABLE IF NOT EXISTS family_activity (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_family_activity_family ON family_activity(family_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_preferences (user_id TEXT PRIMARY KEY, quiet_start TEXT, quiet_end TEXT, timezone TEXT NOT NULL DEFAULT 'UTC', categories TEXT NOT NULL DEFAULT '{"reminders":true,"family":true,"lists":true}', updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS encrypted_backups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, envelope TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_encrypted_backups_user ON encrypted_backups(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (id TEXT PRIMARY KEY, user_id TEXT, event TEXT NOT NULL, details TEXT, ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS family_events (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, creator_user_id TEXT NOT NULL, title TEXT NOT NULL, note TEXT, starts_at INTEGER NOT NULL, ends_at INTEGER, all_day INTEGER NOT NULL DEFAULT 0, recurrence TEXT NOT NULL DEFAULT 'none', color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_family_events_family ON family_events(family_id, starts_at);
CREATE TABLE IF NOT EXISTS family_comments (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, item_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT, reaction TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_family_comments_item ON family_comments(family_id, item_id, created_at);
CREATE TABLE IF NOT EXISTS performance_metrics (id TEXT PRIMARY KEY, user_id TEXT, metric TEXT NOT NULL, value REAL NOT NULL, rating TEXT, path TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_created ON performance_metrics(created_at DESC);
