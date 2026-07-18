-- Security, sync history, household planning, collaboration, storage, and telemetry.
ALTER TABLE "user" ADD COLUMN twoFactorEnabled INTEGER NOT NULL DEFAULT 0;

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

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);

ALTER TABLE family_members ADD COLUMN availability TEXT DEFAULT 'free';
ALTER TABLE family_members ADD COLUMN availability_until INTEGER;

CREATE TABLE IF NOT EXISTS family_events (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  all_day INTEGER NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL DEFAULT 'none',
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_events_family ON family_events(family_id, starts_at);

CREATE TABLE IF NOT EXISTS family_comments (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT,
  reaction TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_comments_item ON family_comments(family_id, item_id, created_at);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  rating TEXT,
  path TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_created ON performance_metrics(created_at DESC);
