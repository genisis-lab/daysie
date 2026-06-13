import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("worker exposes operational health, session, and photo management endpoints", () => {
  const worker = read("worker.js");

  assert.ok(worker.includes('"/health" === p'), "health endpoint should exist");
  assert.ok(
    worker.includes('"/sessions" === p'),
    "session list endpoint should exist",
  );
  assert.ok(
    worker.includes('"/photos" === p'),
    "photo list endpoint should exist",
  );
  assert.ok(
    worker.includes('"/photos/prune-unused" === p'),
    "unused photo cleanup endpoint should exist",
  );
  assert.ok(
    worker.includes("SELECT token, expires FROM sessions WHERE user_id = ?"),
    "sessions endpoint should scope results to the authenticated user",
  );
  assert.ok(
    worker.includes(
      "SELECT key, token, created_at FROM photo_access WHERE user_id = ?",
    ),
    "photo endpoint should scope results to the authenticated user",
  );
});

test("explicit D1 migration documents production schema changes", () => {
  const migrationPath = new URL(
    "../migrations/0001_security_hardening.sql",
    import.meta.url,
  );
  assert.ok(existsSync(migrationPath), "security migration file should exist");
  const migration = read("migrations/0001_security_hardening.sql");
  const deployment = read("DEPLOYMENT.md");

  assert.ok(
    migration.includes("ADD COLUMN redeem_nonce"),
    "migration should add pairing nonce column",
  );
  assert.ok(
    migration.includes("ADD COLUMN session_token"),
    "migration should add pairing session token column",
  );
  assert.ok(
    migration.includes("CREATE TABLE IF NOT EXISTS photo_access"),
    "migration should create photo access table",
  );
  assert.ok(
    deployment.includes("migrations/0001_security_hardening.sql"),
    "deployment guide should reference the migration",
  );
});

test("backup import and cloud account details are wired into the UI", () => {
  const index = read("index.html");
  const app = read("app.js");

  assert.ok(
    index.includes('id="importBtn"'),
    "import button should be present",
  );
  assert.ok(
    index.includes('id="importFile"'),
    "hidden import file input should be present",
  );
  assert.ok(
    index.includes('id="sessionStatus"'),
    "settings should show linked device status",
  );
  assert.ok(
    index.includes('id="photoStorageStatus"'),
    "settings should show cloud photo status",
  );
  assert.ok(
    index.includes('id="cleanupPhotosBtn"'),
    "settings should offer unused photo cleanup",
  );
  assert.ok(
    app.includes("function normalizeImport"),
    "imports should be validated before replacing local data",
  );
  assert.ok(
    app.includes("/photos/prune-unused"),
    "cleanup button should call the photo cleanup endpoint",
  );
  assert.ok(
    app.includes("/sessions"),
    "account details should load session count",
  );
  assert.ok(
    app.includes("/photos"),
    "account details should load cloud photo count",
  );
});
