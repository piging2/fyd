/**
 * Journal gateway request_id dedupe tests (node:test, plain node:http).
 *
 * Proves the hostile-gate behaviors at the gateway layer:
 *  - same request_id twice -> original event_id, deduped:true, one stored event
 *  - dedupe survives process restart (index rebuilt from disk)
 *  - 20 concurrent same-request_id POSTs -> exactly one stored event
 *  - torn last line -> reads keep working, dedupe intact
 *  - malformed request_id -> 400
 *
 * NOTE (2026-10-03): the K2 bearer-token patch requires
 * FYD_JOURNAL_WRITE_TOKEN on POST /events (503 without it). This suite
 * spawns its gateway with a test token and presents it, so the dedupe
 * behaviors are tested through the real auth gate.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "server.mjs");
const STORE_DIR = mkdtempSync(join(tmpdir(), "gw-test-"));
const STORE = join(STORE_DIR, "events.jsonl");
const WRITE_TOKEN = "dedupe-test-token";

let proc = null;
let base = "";

async function waitForReady(url, timeoutMs = 8000) {
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

async function startServer() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 18300 + Math.floor(Math.random() * 90);
    const url = `http://127.0.0.1:${port}`;
    const p = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        FYD_JOURNAL_PORT: String(port),
        FYD_JOURNAL_STORE: STORE,
        FYD_JOURNAL_WRITE_TOKEN: WRITE_TOKEN,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await waitForReady(url);
      proc = p;
      base = url;
      return;
    } catch {
      p.kill("SIGKILL");
      await new Promise((r) => p.on("exit", r));
    }
  }
  throw new Error("could not start gateway on any port");
}

async function stopServer() {
  if (!proc) return;
  const p = proc;
  proc = null;
  p.kill("SIGTERM");
  await new Promise((r) => {
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      r();
    }, 3000);
    p.on("exit", () => {
      clearTimeout(t);
      r();
    });
  });
}

async function postEvent(body) {
  const r = await fetch(base + "/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${WRITE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, doc: await r.json() };
}

function eventBody(requestId, n = 0) {
  return {
    event_type: "FYD_SITE_OVERLAY",
    tenant_id: "test",
    aggregate_id: "fyd-site:test",
    aggregate_type: "fyd_site",
    event_data: { siteId: "test", n },
    ...(requestId ? { request_id: requestId } : {}),
  };
}

async function storedEvents() {
  const r = await fetch(base + "/events/FYD_SITE_OVERLAY?tenant=test&limit=10000");
  assert.equal(r.status, 200);
  return (await r.json()).events;
}

before(async () => {
  await startServer();
});

after(async () => {
  await stopServer();
});

test("identity marker is live-derived (fyd-demo-journal@<hash>)", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  const doc = await r.json();
  assert.match(doc.journal, /^fyd-demo-journal@[0-9a-f]{12}$/);
});

test("same request_id twice -> original event_id, deduped, one stored event", async () => {
  const rid = randomUUID();
  const first = await postEvent(eventBody(rid, 1));
  assert.equal(first.status, 200);
  assert.ok(first.doc.event_id);
  assert.equal(first.doc.deduped, false);

  // Different payload, same request_id: must NOT create a second event.
  const second = await postEvent(eventBody(rid, 2));
  assert.equal(second.status, 200);
  assert.equal(second.doc.event_id, first.doc.event_id);
  assert.equal(second.doc.deduped, true);

  const events = (await storedEvents()).filter((e) => e.request_id === rid);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_id, first.doc.event_id);
});

test("dedupe survives process restart (index rebuilt from disk)", async () => {
  const rid = randomUUID();
  const first = await postEvent(eventBody(rid));
  assert.equal(first.status, 200);

  await stopServer();
  await startServer();

  const second = await postEvent(eventBody(rid));
  assert.equal(second.status, 200);
  assert.equal(second.doc.event_id, first.doc.event_id);
  assert.equal(second.doc.deduped, true);

  const events = (await storedEvents()).filter((e) => e.request_id === rid);
  assert.equal(events.length, 1);
});

test("20 concurrent same-request_id POSTs -> exactly one stored event", async () => {
  const rid = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => postEvent(eventBody(rid, i))),
  );
  for (const r of results) assert.equal(r.status, 200);
  const ids = new Set(results.map((r) => r.doc.event_id));
  assert.equal(ids.size, 1, "all concurrent retries converge on one event_id");
  const events = (await storedEvents()).filter((e) => e.request_id === rid);
  assert.equal(events.length, 1);
});

test("torn last line: reads keep working and dedupe stays intact", async () => {
  const rid = randomUUID();
  const first = await postEvent(eventBody(rid));
  assert.equal(first.status, 200);

  // Simulate a killed writer: garbage appended after the last good line.
  appendFileSync(STORE, '{"torn": true, "event_id":\nnot-json-at-all\n', "utf8");
  await stopServer();
  await startServer();

  const events = await storedEvents();
  assert.ok(events.length >= 1, "journal loads despite torn tail");
  assert.ok(events.every((e) => typeof e.event_id === "string"));

  const retry = await postEvent(eventBody(rid));
  assert.equal(retry.doc.event_id, first.doc.event_id);
  assert.equal(retry.doc.deduped, true);
});

test("malformed request_id -> 400, nothing stored", async () => {
  const before = (await storedEvents()).length;
  for (const bad of [123, "", "x".repeat(129)]) {
    const body = eventBody(null);
    body.request_id = bad; // bypass the helper: falsy values must still be sent
    const r = await postEvent(body);
    assert.equal(r.status, 400);
  }
  assert.equal((await storedEvents()).length, before);
});

test("POST without request_id keeps legacy behavior (fresh event each time)", async () => {
  const a = await postEvent(eventBody(null));
  const b = await postEvent(eventBody(null));
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.doc.event_id, b.doc.event_id);
});
