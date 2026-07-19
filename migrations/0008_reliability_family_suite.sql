-- Durable notification receipts, per-device controls, account claiming,
-- recurring family chores, digest delivery, and availability details.

ALTER TABLE push_subscriptions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE assigned_items ADD COLUMN push_delivered_at INTEGER;
ALTER TABLE assigned_items ADD COLUMN seen_at INTEGER;
ALTER TABLE assigned_items ADD COLUMN completed_at INTEGER;
ALTER TABLE assigned_items ADD COLUMN snoozed_until INTEGER;
ALTER TABLE assigned_items ADD COLUMN recurrence_id TEXT;

ALTER TABLE notification_preferences ADD COLUMN digest_morning INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN digest_evening INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN digest_weekly INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN digest_time TEXT NOT NULL DEFAULT '08:00';

ALTER TABLE family_members ADD COLUMN availability_note TEXT;
ALTER TABLE family_members ADD COLUMN dnd_until INTEGER;

CREATE TABLE IF NOT EXISTS account_migrations (
  legacy_user_id TEXT PRIMARY KEY,
  better_auth_user_id TEXT NOT NULL,
  migrated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_migrations_better_auth
  ON account_migrations(better_auth_user_id, migrated_at DESC);

CREATE TABLE IF NOT EXISTS family_chores (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  recurrence TEXT NOT NULL,
  assignee_order TEXT NOT NULL,
  next_assignee_index INTEGER NOT NULL DEFAULT 0,
  next_due_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_family_chores_due
  ON family_chores(active, next_due_at);
CREATE INDEX IF NOT EXISTS idx_family_chores_family
  ON family_chores(family_id, active, next_due_at);

CREATE TABLE IF NOT EXISTS notification_digest_log (
  user_id TEXT NOT NULL,
  digest_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, digest_type, period_key)
);

CREATE TABLE IF NOT EXISTS backup_verifications (
  backup_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  envelope_hash TEXT NOT NULL,
  verified_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assigned_receipts
  ON assigned_items(family_id, created DESC, seen_at, completed_at);
