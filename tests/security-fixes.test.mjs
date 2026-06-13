import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sliceBetween = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
};

test("family recovery does not insert callers by familyId alone", () => {
  const worker = read("worker.js");
  const recoverBranch = sliceBetween(
    worker,
    '"/family/recover"',
    '"/family/lists"',
  );

  assert.ok(
    recoverBranch.includes("user_id = ?"),
    "recover branch must bind authorization to the caller user_id",
  );
  assert.ok(
    !recoverBranch.includes("INSERT OR REPLACE INTO family_members"),
    "recover must not grant membership by familyId alone",
  );
});

test("private photo reads require authorization or a photo access token", () => {
  const worker = read("worker.js");
  const photoGetBranch = sliceBetween(
    worker,
    'p.startsWith("/photo/") && "GET" === e.method',
    'p.startsWith("/photo/") && "DELETE" === e.method',
  );

  assert.ok(
    photoGetBranch.includes("photo_access"),
    "photo GET must check a stored photo access token",
  );
  assert.match(
    photoGetBranch,
    /await\s+r\(\s*e,\s*E\s*\)/,
    "photo GET must accept bearer authorization for owner reads",
  );
  assert.ok(
    photoGetBranch.includes("private, no-store"),
    "private photos must not be cached publicly",
  );
});

test("device pairing status is bound to the redeeming client nonce", () => {
  const worker = read("worker.js");
  const app = read("app.js");

  assert.ok(
    worker.includes("redeem_nonce"),
    "pairing storage must include a redeem nonce",
  );
  assert.ok(
    worker.includes("session_token"),
    "runtime migrations must support existing pair_codes tables",
  );
  assert.ok(
    worker.includes("redeemed = 0 AND approved = 0"),
    "redeem must be a one-time pre-approval transition",
  );
  assert.ok(
    worker.includes(
      "redeemed = 1 AND approved = 0 AND redeem_nonce IS NOT NULL",
    ),
    "approve must only complete a pending redeemed pairing",
  );
  assert.ok(
    worker.includes("crypto.randomUUID()"),
    "redeem nonce must be generated with secure randomness",
  );
  assert.match(
    app,
    /JSON\.stringify\(\{\s*code:\s*e,\s*nonce:\s*n\s*\}\)/s,
    "client status polling must send the redeem nonce",
  );
});

test("local-only onboarding does not automatically create a cloud sync account", () => {
  const app = read("app.js");
  const app3 = read("app3.js");
  const familyBoot = sliceBetween(
    app3,
    "async function familyBoot()",
    'wire("#famSaveMeBtn"',
  );
  const refreshPushSubscription = sliceBetween(
    app,
    "async function refreshPushSubscription()",
    "function urlBase64ToUint8Array(",
  );
  const enableNotifications = sliceBetween(
    app,
    "async function enableNotifications()",
    "async function refreshPushSubscription()",
  );
  const loadFamily = sliceBetween(
    app3,
    "async function loadFamily()",
    "async function recoverCachedFamily()",
  );
  const openFamilyDialog = sliceBetween(
    app3,
    "async function openFamilyDialog()",
    "function wire(",
  );

  assert.equal(
    (app.match(/autoEnableSync\(\)/g) || []).length,
    0,
    "autoEnableSync should not remain callable",
  );
  assert.ok(
    !familyBoot.includes("ensureAccount"),
    "background family boot must not create accounts automatically",
  );
  assert.ok(
    !refreshPushSubscription.includes("ensureAccount"),
    "push refresh must not create accounts automatically",
  );
  assert.ok(
    !enableNotifications.includes("ensureAccount"),
    "notification setup must not create accounts automatically",
  );
  assert.ok(
    !loadFamily.includes("ensureAccount"),
    "family read flow must not create accounts automatically",
  );
  assert.ok(
    !openFamilyDialog.includes("ensureAccount"),
    "opening the family dialog must not create accounts automatically",
  );
});

test("shared list identifiers are escaped before entering HTML attributes", () => {
  const app2 = read("app2.js");

  assert.ok(
    !app2.includes('data-list="${t.id}"'),
    "list id must not be written raw into data-list",
  );
  assert.ok(
    !app2.includes('data-item="${e.id}"'),
    "item id must not be written raw into data-item",
  );
  assert.ok(
    !app2.includes('data-dellist="${t.id}"'),
    "list id must not be written raw into data-dellist",
  );
});

test("synced task and photo attributes are sanitized before innerHTML rendering", () => {
  const app = read("app.js");

  assert.ok(
    app.includes("safeDomId"),
    "task/list DOM identifiers need a safe attribute helper",
  );
  assert.ok(app.includes("safePhotoSrc"), "photo URLs need a safe src helper");
  assert.ok(
    !app.includes('<img src="${e}"'),
    "photo strings must not be rendered raw",
  );
  assert.ok(
    !app.includes('data-subtask="${t.id}"'),
    "subtask ids must not be rendered raw",
  );
  assert.ok(
    !app.includes('data-assignee="${e.id}"'),
    "assignee ids must not be rendered raw",
  );
});

test("journal HTML export escapes all dynamic HTML and attribute fields", () => {
  const app = read("app.js");

  assert.ok(
    !app.includes("Daysie Journal - ${e.name}"),
    "exported profile name must be escaped",
  );
  assert.ok(
    !app.includes('<img src="${e}" />'),
    "exported photo src must be sanitized",
  );
});

test("third-party scripts use integrity and are not cached by the service worker", () => {
  const index = read("index.html");
  const sw = read("sw.js");

  assert.ok(
    index.includes('integrity="sha384-'),
    "third-party script must use SRI",
  );
  assert.ok(
    index.includes('crossorigin="anonymous"'),
    "SRI script must set crossorigin=anonymous",
  );
  assert.ok(
    !sw.includes("cdnjs.cloudflare.com"),
    "service worker must not precache/cache third-party CDN scripts",
  );
  assert.ok(
    sw.includes("safeClientUrl"),
    "notification click targets must be normalized to same-origin URLs",
  );
});

test("push subscriptions validate callback destinations before storage or fetch", () => {
  const worker = read("worker.js");

  assert.ok(
    worker.includes("isSafePushEndpoint"),
    "worker must define a push endpoint allowlist",
  );
  assert.ok(
    worker.includes("Invalid push endpoint"),
    "subscribe route must reject invalid endpoints",
  );
});

test("Cloudflare Pages security headers are configured", () => {
  const headers = read("_headers");
  assert.ok(
    existsSync(new URL("../_headers", import.meta.url)),
    "Cloudflare Pages _headers file should exist",
  );
  assert.ok(
    headers.includes("Strict-Transport-Security"),
    "Cloudflare Pages headers should enable HSTS",
  );
});
