-- App-owned tables retain backwards compatibility with legacy device accounts.
-- Mirror Better Auth identities into that parent table so its foreign keys work.
INSERT OR IGNORE INTO users (id, email, created_at)
SELECT id, email, createdAt FROM "user";
