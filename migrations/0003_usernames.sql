-- Add Better Auth's username-plugin fields without affecting existing users.
ALTER TABLE "user" ADD COLUMN username TEXT;
ALTER TABLE "user" ADD COLUMN displayUsername TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_better_user_username ON "user"(username);
