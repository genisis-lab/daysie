-- Reminder delivery ledger and expired push connections.
--
-- reminder_deliveries makes server reminders exactly-once per (task, due time)
-- even when a device sync overwrites the task's "notified" flag or two cron
-- runs overlap. push_expired_endpoints remembers subscriptions the push service
-- rejected (404/410) so the device is told to re-subscribe instead of silently
-- re-registering a dead endpoint after long use.
--
-- The Worker also creates these tables on demand, so applying this migration
-- before or after deploying is safe.

CREATE TABLE IF NOT EXISTS reminder_deliveries (
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  delivered_at INTEGER,
  PRIMARY KEY (user_id, task_id, due_at)
);
CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_claimed
  ON reminder_deliveries(claimed_at);

CREATE TABLE IF NOT EXISTS push_expired_endpoints (
  endpoint_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT,
  expired_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_expired_endpoints_expired
  ON push_expired_endpoints(expired_at);
