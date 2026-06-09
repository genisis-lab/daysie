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
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_pair_codes_user ON pair_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_pair_codes_expires ON pair_codes(expires);


CREATE TABLE IF NOT EXISTS family_members (
  family_id TEXT,
  user_id TEXT PRIMARY KEY,
  name TEXT,
  emoji TEXT,
  color TEXT,
  joined INTEGER
);
CREATE TABLE IF NOT EXISTS family_invites (
  code TEXT PRIMARY KEY,
  family_id TEXT,
  created INTEGER,
  expires INTEGER
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
