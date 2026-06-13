ALTER TABLE pair_codes ADD COLUMN redeem_nonce TEXT;
ALTER TABLE pair_codes ADD COLUMN session_token TEXT;

CREATE TABLE IF NOT EXISTS photo_access (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_photo_access_user ON photo_access(user_id);
