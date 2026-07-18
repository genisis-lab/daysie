-- Multi-device Web Push subscriptions and platform-aware alert preferences.
CREATE TABLE push_subscriptions_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_status INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO push_subscriptions_v2 (
  id, user_id, endpoint, subscription, device_name, user_agent,
  created_at, updated_at, last_success_at, last_failure_at, last_status
)
SELECT
  lower(hex(randomblob(16))),
  user_id,
  json_extract(subscription, '$.endpoint'),
  subscription,
  'Previously linked device',
  NULL,
  created_at,
  created_at,
  NULL,
  NULL,
  NULL
FROM push_subscriptions
WHERE json_extract(subscription, '$.endpoint') IS NOT NULL;

DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions_v2 RENAME TO push_subscriptions;
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id, updated_at DESC);

ALTER TABLE notification_preferences ADD COLUMN tone TEXT NOT NULL DEFAULT 'system';
ALTER TABLE notification_preferences ADD COLUMN vibration TEXT NOT NULL DEFAULT 'system';
