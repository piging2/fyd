/**
 * Postgres-backed journal gateway: adversarial tenant-isolation tests +
 * the full local loop. (node:test, plain node:http.)
 *
 * Every test hits a REAL Postgres-backed gateway (FYD_JOURNAL_PG_URL set):
 * grants AND policies, not just app logic. The suite proves the hostile
 * gate behaviors at the gateway layer:
 *   - OWNER A READ A = ALLOW
 *   - OWNER A READ B PRIVATE = DENY (no cross-tenant leakage on read)
 *   - OWNER A WRITE B = DENY (tenant_mismatch on tampered envelope)
 *   - ANON journal read without tenant = DENY (400 tenant_required)
 *   - cross-tenant request_id reuse = 400 request_id_tenant_conflict,
 *     zero disclosure of the original event_id
 *   - same-tenant request_id replay -> original event_id, deduped:true
 *   - N concurrent same-request_id POSTs -> exactly one stored event
 *   - service append with valid bearer = narrowly allowed (200, exact shape)
 *   - append with missing bearer = 503 write_auth_not_configured
 *   - append with wrong bearer = 401 write_auth_denied
 *   - event + dedupe survive SIGKILL restart (the multi-instance latent fix:
 *     dedupe is Postgres-backed, not a per-process map)
 *   - canonical (timestamp, event_id) read order
 *   - full local loop: POST overlay -> GET read-back -> replay through the
 *     EXISTING overlay reducer (applyTenantOverlays) -> expected state
 *
 * Requires FYD_JOURNAL_TEST_PG_URL in the environment (a throwaway Postgres
 * database; the suite only touches the fyd_journal_events table it creates).
 * Tenants and request_ids are randomized per run, so reruns are isolated.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "server.mjs");
const REPO_ROOT = join(HERE, "..", "..", "..");
const REPLAY_PROOF = join(HERE, "pg-replay-proof.mts");

const TEST_PG_URL = process.env.FYD_JOURNAL_TEST_PG_URL;
if (!TEST_PG_URL) {
  throw new Error(
    "pg-adversarial.test.mjs: FYD_JOURNAL_TEST_PG_URL must be set to a throwaway " +
      "Postgres database URL. Refusing to run against an unknown database.",
  );
}
const TOKEN = "test-token-" + randomUUID();
const RUN = "t" + randomUUID().slice(0, 8); // ^[a-z0-9-]{1,64}$-safe
const tenantA = `${RUN}-owner-a`;
const tenantB = `${RUN}-owner-b`;

let proc = null;
let base = "";
let port = 0;

async function waitForReady(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(url + "/");
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("gateway did not become ready: " + url);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function startServer(envExtra = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = 18400 + Math.floor(Math.random() * 90);
    const url = `http://127.0.0.1:${p}`;
    const child = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        FYD_JOURNAL_PORT: String(p),
        FYD_JOURNAL_PG_URL: TEST_PG_URL,
        FYD_JOURNAL_WRITE_TOKEN: TOKEN,
        ...envExtra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let earlyExit = false;
    child.on("exit", () => {
      earlyExit = true;
    });
    try {
      await waitForReady(url);
      proc = child;
      base = url;
      port = p;
      return;
    } catch {
      child.kill("SIGKILL");
      await new Promise((r) => child.on("exit", r));
      if (earlyExit) {
        // fall through and retry on another port
      }
    }
  }
  throw new Error("could not start PG-backed gateway on any port");
}

async function stopServer(signal = "SIGTERM") {
  if (!proc) return;
  const p = proc;
  proc = null;
  p.kill(signal);
  await new Promise((r) => {
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      r();
    }, 4000);
    p.on("exit", () => {
      clearTimeout(t);
      r();
    });
  });
}

async function postEvent(body, token = TOKEN) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const r = await fetch(base + "/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, doc: await r.json() };
}

function overlayBody(tenant, siteId, requestId, ops = [{ op: "noop-probe" }]) {
  return {
    event_type: "FYD_SITE_OVERLAY",
    tenant_id: tenant,
    aggregate_id: "fyd-site:" + tenant,
    aggregate_type: "fyd_site",
    event_data: { siteId, ops },
    ...(requestId ? { request_id: requestId } : {}),
  };
}

async function readTenant(tenant, extra = "") {
  const r = await fetch(
    `${base}/events/FYD_SITE_OVERLAY?tenant=${encodeURIComponent(tenant)}${extra}`,
  );
  return { status: r.status, doc: await r.json() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  await startServer();
});

after(async () => {
  await stopServer();
});

// ---------------------------------------------------------------------------
// Identity + auth gates
// ---------------------------------------------------------------------------

test("identity marker is live-derived from the PG backing (fyd-demo-journal@<hash>)", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  const doc = await r.json();
  assert.equal(doc.service, "fyd-journal-gateway");
  assert.match(doc.journal, /^fyd-demo-journal@[0-9a-f]{12}$/);
  // The marker must differ from the JSONL backing's marker for the same
  // binary: it is derived from the backing identity, never static.
  const u = new URL(TEST_PG_URL);
  const redacted = `pg:${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "") || "?"}`;
  const expected =
    "fyd-demo-journal@" +
    createHash("sha256")
      .update("fyd-journal-gateway|" + redacted, "utf8")
      .digest("hex")
      .slice(0, 12);
  assert.equal(doc.journal, expected);
  assert.ok(String(doc.store).startsWith("pg:"));
  assert.ok(!String(doc.store).includes(u.password || "nope-not-there"), "no credential in store label");
});

test("append with NO bearer configured anywhere -> 503 write_auth_not_configured, zero writes", async () => {
  // A second gateway on another port, same PG database, no token: fail closed.
  const p = 18500 + Math.floor(Math.random() * 90);
  const url = `http://127.0.0.1:${p}`;
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      FYD_JOURNAL_PORT: String(p),
      FYD_JOURNAL_PG_URL: TEST_PG_URL,
      FYD_JOURNAL_WRITE_TOKEN: "",
      DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForReady(url);
    const before = await readTenant(tenantA);
    const r = await fetch(url + "/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(overlayBody(tenantA, tenantA, randomUUID())),
    });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, "write_auth_not_configured");
    const afterState = await readTenant(tenantA);
    assert.equal(afterState.doc.count, before.doc.count, "503 wrote nothing");
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => child.on("exit", r));
  }
});

test("append with wrong bearer -> 401 write_auth_denied, zero writes", async () => {
  const before = (await readTenant(tenantA)).doc.count;
  const r = await postEvent(overlayBody(tenantA, tenantA, randomUUID()), "wrong-token");
  assert.equal(r.status, 401);
  assert.equal(r.doc.error, "write_auth_denied");
  assert.equal((await readTenant(tenantA)).doc.count, before);
});

test("service append with valid bearer = narrowly allowed (200, exact record shape)", async () => {
  const r = await postEvent(overlayBody(tenantA, tenantA, randomUUID()));
  assert.equal(r.status, 200);
  assert.match(r.doc.event_id, /^fyd-ovl-[0-9a-z]+-[0-9a-f]{12}$/);
  assert.equal(r.doc.deduped, false);

  const read = await readTenant(tenantA);
  const rec = read.doc.events.find((e) => e.event_id === r.doc.event_id);
  assert.ok(rec, "appended event reads back");
  assert.deepEqual(Object.keys(rec).sort(), [
    "aggregate_id",
    "aggregate_type",
    "event_data",
    "event_id",
    "event_type",
    "request_id",
    "tenant_id",
    "timestamp",
  ]);
  assert.match(rec.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(rec.tenant_id, tenantA);
  assert.equal(rec.event_data.siteId, tenantA);
});

// ---------------------------------------------------------------------------
// Tenant isolation: reads
// ---------------------------------------------------------------------------

test("OWNER A READ A = ALLOW; OWNER A READ B PRIVATE = DENY (no cross-tenant leakage)", async () => {
  const ra = await postEvent(overlayBody(tenantA, tenantA, randomUUID(), [{ op: "a-probe" }]));
  const rb = await postEvent(overlayBody(tenantB, tenantB, randomUUID(), [{ op: "b-probe" }]));
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);

  const readB = await readTenant(tenantB);
  assert.equal(readB.status, 200);
  assert.ok(readB.doc.events.length >= 1);
  for (const e of readB.doc.events) {
    assert.equal(e.tenant_id, tenantB, "tenant B read must never see tenant A rows");
    assert.equal(e.event_data.siteId, tenantB);
    assert.notEqual(e.event_id, ra.doc.event_id);
  }
  assert.ok(
    readB.doc.events.some((e) => e.event_id === rb.doc.event_id),
    "tenant B sees its own event",
  );

  const readA = await readTenant(tenantA);
  for (const e of readA.doc.events) assert.equal(e.tenant_id, tenantA);
});

test("ANON journal read without tenant = DENY (400 tenant_required)", async () => {
  for (const qs of ["", "?limit=5", "?tenant=", "?tenant=HAS-UPPERCASE"]) {
    const r = await fetch(`${base}/events/FYD_SITE_OVERLAY${qs}`);
    assert.equal(r.status, 400, qs);
    assert.equal((await r.json()).error, "tenant_required");
  }
  // Path traversal shaped tenant is not a valid tenant id either.
  const r = await fetch(`${base}/events/FYD_SITE_OVERLAY?tenant=..%2F..%2Fetc`);
  assert.equal(r.status, 400);
});

// ---------------------------------------------------------------------------
// Tenant isolation: writes
// ---------------------------------------------------------------------------

test("OWNER A WRITE B = DENY: tampered tenant binding refused, never journaled", async () => {
  const beforeB = (await readTenant(tenantB)).doc.count;

  // envelope claims B, payload says A
  let r = await postEvent({ ...overlayBody(tenantB, tenantB, randomUUID()), event_data: { siteId: tenantA, ops: [] } });
  assert.equal(r.status, 400);
  assert.equal(r.doc.error, "tenant_mismatch");

  // envelope claims B, aggregate says A
  r = await postEvent({ ...overlayBody(tenantB, tenantB, randomUUID()), aggregate_id: "fyd-site:" + tenantA });
  assert.equal(r.status, 400);
  assert.equal(r.doc.error, "tenant_mismatch");

  // missing tenant entirely
  r = await postEvent({
    event_type: "FYD_SITE_OVERLAY",
    event_data: { siteId: tenantB, ops: [] },
    request_id: randomUUID(),
  });
  assert.equal(r.status, 400);
  assert.equal(r.doc.error, "tenant_required");

  const afterB = (await readTenant(tenantB)).doc.count;
  assert.equal(afterB, beforeB, "denied writes journal nothing");
});

test("cross-tenant request_id reuse = 400 request_id_tenant_conflict, zero disclosure", async () => {
  const rid = randomUUID();
  const first = await postEvent(overlayBody(tenantA, tenantA, rid));
  assert.equal(first.status, 200);
  const beforeB = (await readTenant(tenantB)).doc.count;

  // Tenant B reuses A's request_id with an otherwise VALID B envelope.
  const clash = await postEvent(overlayBody(tenantB, tenantB, rid));
  assert.equal(clash.status, 400);
  assert.equal(clash.doc.error, "request_id_tenant_conflict");
  assert.ok(!("event_id" in clash.doc), "zero disclosure: no event_id on conflict");
  assert.ok(
    !JSON.stringify(clash.doc).includes(first.doc.event_id),
    "zero disclosure: original event_id nowhere in the response",
  );

  const afterB = (await readTenant(tenantB)).doc.count;
  assert.equal(afterB, beforeB, "conflicting write journals nothing under B");
});

test("same-tenant request_id replay -> original event_id, deduped:true, one stored row", async () => {
  const rid = randomUUID();
  const first = await postEvent(overlayBody(tenantA, tenantA, rid, [{ op: "v1" }]));
  assert.equal(first.status, 200);
  assert.equal(first.doc.deduped, false);

  // Different payload, same request_id: must NOT create a second event.
  const second = await postEvent(overlayBody(tenantA, tenantA, rid, [{ op: "v2" }]));
  assert.equal(second.status, 200);
  assert.equal(second.doc.event_id, first.doc.event_id);
  assert.equal(second.doc.deduped, true);

  const rows = (await readTenant(tenantA)).doc.events.filter((e) => e.request_id === rid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, first.doc.event_id);
});

test("10 concurrent same-request_id POSTs -> exactly one stored event", async () => {
  const rid = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      postEvent(overlayBody(tenantA, tenantA, rid, [{ op: "race-" + i }])),
    ),
  );
  for (const r of results) assert.equal(r.status, 200);
  const ids = new Set(results.map((r) => r.doc.event_id));
  assert.equal(ids.size, 1, "all concurrent retries converge on one event_id");
  const rows = (await readTenant(tenantA)).doc.events.filter((e) => e.request_id === rid);
  assert.equal(rows.length, 1);
});

test("malformed request_id -> 400, nothing stored", async () => {
  const before = (await readTenant(tenantA)).doc.count;
  for (const bad of [123, "", "x".repeat(129)]) {
    const body = overlayBody(tenantA, tenantA, null);
    body.request_id = bad;
    const r = await postEvent(body);
    assert.equal(r.status, 400);
  }
  assert.equal((await readTenant(tenantA)).doc.count, before);
});

// ---------------------------------------------------------------------------
// Restart survival: the multi-instance latent fix
// ---------------------------------------------------------------------------

test("event + dedupe survive SIGKILL restart (dedupe is Postgres-backed, not per-process)", async () => {
  const rid = randomUUID();
  const first = await postEvent(overlayBody(tenantA, tenantA, rid, [{ op: "survive" }]));
  assert.equal(first.status, 200);

  await stopServer("SIGKILL");
  await startServer(); // same PG database, fresh process, empty memory

  const read = await readTenant(tenantA);
  assert.ok(
    read.doc.events.some((e) => e.event_id === first.doc.event_id),
    "event survived the crash",
  );

  const replay = await postEvent(overlayBody(tenantA, tenantA, rid, [{ op: "survive-retry" }]));
  assert.equal(replay.status, 200);
  assert.equal(replay.doc.event_id, first.doc.event_id);
  assert.equal(replay.doc.deduped, true);

  const rows = (await readTenant(tenantA)).doc.events.filter((e) => e.request_id === rid);
  assert.equal(rows.length, 1, "no duplicate across the restart");
});

// ---------------------------------------------------------------------------
// Canonical order + the full local loop through the existing reducer
// ---------------------------------------------------------------------------

test("reads are in canonical (timestamp, event_id) ascending order", async () => {
  const tenant = `${RUN}-order`;
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await postEvent(overlayBody(tenant, tenant, randomUUID(), [{ op: "seq-" + i }]));
    assert.equal(r.status, 200);
    ids.push(r.doc.event_id);
    await sleep(15); // distinct millisecond timestamps
  }
  const read = await readTenant(tenant, "&limit=100");
  const got = read.doc.events.map((e) => e.event_id);
  assert.deepEqual(got, ids, "insertion order preserved");
  for (let i = 1; i < read.doc.events.length; i++) {
    const a = read.doc.events[i - 1];
    const b = read.doc.events[i];
    assert.ok(
      a.timestamp < b.timestamp ||
        (a.timestamp === b.timestamp && a.event_id < b.event_id),
      `canonical order violated at index ${i}`,
    );
  }
});

test("full local loop: POST overlay -> GET read-back -> replay through applyTenantOverlays", async () => {
  const tenant = `${RUN}-replay`;
  const objId = "replay-obj-1";
  const seq = [
    {
      op: "add_object",
      object: { id: objId, schema: "test.object@1", title: "orig", fields: {} },
    },
    { op: "set_field", objectId: objId, field: "title", value: "first" },
    { op: "set_field", objectId: objId, field: "title", value: "second" },
  ];
  const eventIds = [];
  for (const op of seq) {
    const r = await postEvent(overlayBody(tenant, tenant, randomUUID(), [op]));
    assert.equal(r.status, 200, JSON.stringify(r.doc));
    eventIds.push(r.doc.event_id);
    await sleep(15);
  }

  // The replay proof imports the EXISTING reducer and folds the
  // gateway-read events exactly like PingObjectReader does. The repo's
  // tsx binary is used (not node --import tsx/esm): tsx's CJS require
  // hook does not apply tsconfig paths, but the binary's resolver does.
  // TSX_TSCONFIG_PATH gives it the repo @/ alias (root tsconfig sets
  // paths without baseUrl, which tsx alone does not apply).
  const tsxBin = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const child = await new Promise((resolve, reject) => {
    const p = spawn(tsxBin, [REPLAY_PROOF, base, tenant], {
      cwd: REPO_ROOT,
      env: { ...process.env, TSX_TSCONFIG_PATH: join(HERE, "tsconfig.json") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (err += c));
    p.on("exit", (code) => resolve({ code, out, err }));
    p.on("error", reject);
  });
  assert.equal(child.code, 0, "replay proof failed:\n" + child.err + "\n" + child.out);
  const verdict = JSON.parse(child.out.trim().split("\n").pop());
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.equal(verdict.objectCount, 1);
  assert.equal(verdict.title, "second", "order-dependent reducer: last set_field wins");
  assert.deepEqual(
    [...verdict.provenanceEvidence].sort(),
    [...eventIds].sort().map((id) => `ping-event:${id}`),
    "every journaled event left its provenance evidence",
  );
});
