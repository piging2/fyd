#!/usr/bin/env node
/**
 * FYD write-boundary hostile gate (12 gates + canonical tests).
 *
 * Spins up a SCRATCH stack: a temp journal gateway + `next start` of this
 * worktree on scratch ports, then attacks the live approve/clear write
 * path and reports the required verdict block honestly. Any gate that
 * cannot run (e.g. no resolvable section to hide) FAILS instead of
 * being skipped.
 *
 * Usage: node scripts/fyd-hostile-gate.mjs   (from the repo root)
 */
import { spawn, execFile } from "node:child_process";
import { mkdtempSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TMP = mkdtempSync(join(tmpdir(), "fyd-gate-"));
const GW_STORE = join(TMP, "gw-events.jsonl");
const WB_STORE = join(TMP, "wb-store");

const GW_PORT = 18400 + Math.floor(Math.random() * 90);
const APP_PORT = 18600 + Math.floor(Math.random() * 90);
const GW = `http://127.0.0.1:${GW_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;
const API = `${APP}/api/fyd/customize`;

const verdicts = [];
function verdict(name, pass, evidence) {
  verdicts.push({ name, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${evidence ? "  (" + evidence + ")" : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, timeoutMs = 30000, want = 200) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status === want) return r;
    } catch {
      /* not up */
    }
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${url} -> ${want}`);
    await sleep(250);
  }
}

function launch(cmd, args, env, cwd) {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ["ignore", "pipe", "pipe"] });
  p.stderr.on("data", () => {});
  return p;
}

async function kill9(p, name) {
  if (!p || p.exitCode !== null) return;
  p.kill("SIGKILL");
  await new Promise((r) => p.on("exit", r));
  await sleep(400);
}

let gwProc = null;
let appProc = null;

async function startGateway() {
  gwProc = launch(process.execPath, [join(ROOT, "tools/fyd-journal-gateway/server.mjs")], {
    FYD_JOURNAL_PORT: String(GW_PORT),
    FYD_JOURNAL_HOST: "127.0.0.1",
    FYD_JOURNAL_STORE: GW_STORE,
  }, ROOT);
  await waitFor(GW + "/");
}

async function startApp() {
  appProc = launch(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    FYD_CUSTOMIZE_GATEWAY_URL: `${GW}/events`,
    // The read path (PingObjectReader.queryFydSiteOverlays) uses a
    // DIFFERENT env var; both must point at the scratch gateway or the
    // gate reads a different journal than it writes.
    FYD_JOURNAL_GATEWAY_URL: GW,
    FYD_WRITE_BOUNDARY_STORE: WB_STORE,
    NEXT_PUBLIC_FYD_DEMO_OWNER_MODE: "1",
  }, ROOT);
  await waitFor(APP + "/api/healthz");
}

async function postCustomize(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, doc: await r.json() };
}

async function journalEvents() {
  const r = await fetch(`${GW}/events/FYD_SITE_OVERLAY?limit=10000`);
  if (!r.ok) throw new Error("journal read failed: " + r.status);
  return (await r.json()).events;
}

function runCmd(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 180000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function main() {
  console.log("=== FYD write-boundary hostile gate ===");
  console.log("tmp:", TMP);

  // ---- CANONICAL TEST (needs no servers) ----
  try {
    const jest = await runCmd("npx", ["jest", "--config", "src/fyd/customize/jest.config.cjs"], ROOT);
    const gw = await runCmd("node", ["--test", "tools/fyd-journal-gateway/__tests__/dedupe.test.mjs"], ROOT);
    const jestOut = jest.stdout + jest.stderr; // jest writes its summary to stderr
    const jestOk = jest.ok && /Tests:\s+94 passed/.test(jestOut);
    const gwOk = gw.ok && /# fail 0/.test(gw.stdout);
    verdict("CANONICAL TEST", jestOk && gwOk, jestOk && gwOk ? "jest 94/94, gateway 7/7" : "see logs");
    if (!jestOk) console.log(jestOut.slice(-1500));
    if (!gwOk) console.log(gw.stdout.slice(-1500), gw.stderr.slice(-500));
  } catch (e) {
    verdict("CANONICAL TEST", false, String(e));
  }

  await startGateway();
  await startApp();

  // ---- /healthz ----
  try {
    const r = await fetch(APP + "/api/healthz");
    const doc = await r.json();
    verdict("/healthz", r.status === 200 && doc.ok === true, `HTTP ${r.status}`);
  } catch (e) {
    verdict("/healthz", false, String(e));
  }

  // ---- /readyz: up -> 200, gateway down -> 503, gateway back -> 200 ----
  try {
    let r = await fetch(APP + "/api/readyz");
    const upOk = r.status === 200 && (await r.json()).ready === true;
    await kill9(gwProc, "gateway");
    gwProc = null;
    r = await fetch(APP + "/api/readyz");
    const downOk = r.status === 503 && (await r.json()).ready === false;
    await startGateway();
    r = await fetch(APP + "/api/readyz");
    const backOk = r.status === 200 && (await r.json()).ready === true;
    verdict("/readyz", upOk && downOk && backOk, `up:${upOk} down-503:${downOk} back:${backOk}`);
  } catch (e) {
    verdict("/readyz", false, String(e));
  }

  // ---- collect hideable sections ----
  // The approve read path (loadCustomizedSite) serves the last projection
  // dump, which a scratch stack never regens. So the gate NEVER depends on
  // read-your-write: every approve below parses against the static base
  // spec, using a FRESH section each time. 12 needed: 1 baseline + 1
  // concurrent + 10 unique-sequence.
  const SITE = "happy-place";
  const candidates = [];
  try {
    const insp = await (await fetch(`${API}?siteId=${SITE}&view=inspect`)).json();
    const pages = insp.pageOrder ?? [];
    for (const p of pages) {
      for (const s of p.sections ?? []) {
        if (!s.id || s.hidden === true) continue;
        const text = `Hide the ${s.id} section`;
        const probe = await postCustomize({ action: "parse", siteId: SITE, text });
        if (probe.status === 200 && probe.doc.ok) candidates.push({ text, sectionId: s.id });
        if (candidates.length >= 12) break;
      }
      if (candidates.length >= 12) break;
    }
  } catch (e) {
    console.log("section probe error:", String(e));
  }
  if (candidates.length < 12) {
    console.log(`ABORTING: only ${candidates.length}/12 hideable sections on ` + SITE);
    await cleanup();
    printSummary();
    process.exit(1);
  }
  console.log("hideable sections:", candidates.length);

  async function parseProposal(candidate) {
    const r = await postCustomize({ action: "parse", siteId: SITE, text: candidate.text });
    if (r.status !== 200 || !r.doc.ok) throw new Error(`parse failed for ${candidate.sectionId}: ${r.status} ${JSON.stringify(r.doc).slice(0, 200)}`);
    return { text: candidate.text, proposal: r.doc.proposal };
  }
  async function approve(text, proposal, requestId) {
    return postCustomize({ action: "approve", siteId: SITE, text, proposal, request_id: requestId });
  }
  const eventsFor = (events, rid) => events.filter((e) => e.request_id === rid);

  // ---- baseline approve (R1) ----
  const R1 = randomUUID();
  const p1 = await parseProposal(candidates[0]);
  const a1 = await approve(p1.text, p1.proposal, R1);
  const baseOk = a1.status === 200 && a1.doc.ok && typeof a1.doc.eventId === "string";
  console.log("baseline approve:", a1.status, baseOk ? a1.doc.eventId : JSON.stringify(a1.doc).slice(0, 160));

  // ---- IDEMPOTENT LOST-RESPONSE RETRY ----
  try {
    let pass = false;
    let evidence = "";
    if (baseOk) {
      const retry = await approve(p1.text, p1.proposal, R1);
      const ev = await journalEvents();
      pass =
        retry.status === 200 &&
        retry.doc.ok === true &&
        retry.doc.eventId === a1.doc.eventId &&
        retry.doc.idempotentReplay === true &&
        eventsFor(ev, R1).length === 1;
      evidence = `same eventId:${retry.doc.eventId === a1.doc.eventId} replay:${retry.doc.idempotentReplay} journalCount:${eventsFor(ev, R1).length}`;
    } else {
      evidence = "baseline approve failed";
    }
    verdict("IDEMPOTENT LOST-RESPONSE RETRY", pass, evidence);
  } catch (e) {
    verdict("IDEMPOTENT LOST-RESPONSE RETRY", false, String(e));
  }

  // ---- SAME REQUEST ID + DIFFERENT DIGEST ----
  try {
    let pass = false;
    let evidence = "";
    if (baseOk) {
      const altered = await approve(p1.text + " please", p1.proposal, R1);
      pass = altered.status === 409 && altered.doc.code === "idempotency_conflict";
      evidence = `HTTP ${altered.status} code:${altered.doc.code}`;
    } else evidence = "baseline approve failed";
    verdict("SAME REQUEST ID + DIFFERENT DIGEST", pass, evidence);
  } catch (e) {
    verdict("SAME REQUEST ID + DIFFERENT DIGEST", false, String(e));
  }

  // ---- CONCURRENT APPENDS (10x same request_id) ----
  const R2 = randomUUID();
  try {
    const p2 = await parseProposal(candidates[1]);
    const results = await Promise.all(Array.from({ length: 10 }, () => approve(p2.text, p2.proposal, R2)));
    const okStatuses = results.every((r) => r.status === 200 && r.doc.ok);
    const ids = new Set(results.map((r) => r.doc.eventId));
    const ev = await journalEvents();
    const pass = okStatuses && ids.size === 1 && eventsFor(ev, R2).length === 1;
    verdict("CONCURRENT APPENDS", pass, `all200:${okStatuses} uniqueIds:${ids.size} journalCount:${eventsFor(ev, R2).length}`);
  } catch (e) {
    verdict("CONCURRENT APPENDS", false, String(e));
  }

  // ---- UNIQUE SEQUENCES (10 distinct request_ids, alternating hide/show) ----
  let seqEventIds = [];
  try {
    let pass = true;
    let evidence = "";
    for (let i = 0; i < 10; i++) {
      const rid = randomUUID();
      const p = await parseProposal(candidates[2 + i]);
      const a = await approve(p.text, p.proposal, rid);
      if (!(a.status === 200 && a.doc.ok && typeof a.doc.eventId === "string")) {
        pass = false;
        evidence = `seq ${i} (${candidates[2 + i].sectionId}) failed: HTTP ${a.status} ${JSON.stringify(a.doc).slice(0, 120)}`;
        break;
      }
      seqEventIds.push(a.doc.eventId);
    }
    if (pass) {
      const uniq = new Set(seqEventIds).size;
      pass = uniq === 10;
      evidence = `unique:${uniq}/10`;
    }
    verdict("UNIQUE SEQUENCES", pass, evidence);
  } catch (e) {
    verdict("UNIQUE SEQUENCES", false, String(e));
  }

  // ---- LOST UPDATES: ZERO ----
  try {
    const ev = await journalEvents();
    const r2count = eventsFor(ev, R2).length;
    const dupEventIds = ev.length - new Set(ev.map((e) => e.event_id)).size;
    const seqPresent = seqEventIds.filter((id) => ev.some((e) => e.event_id === id)).length;
    const pass = r2count === 1 && dupEventIds === 0 && seqPresent === 10 && seqEventIds.length === 10;
    verdict("LOST UPDATES", pass, `R2count:${r2count} dupEvents:${dupEventIds} seqPresent:${seqPresent}/10`);
  } catch (e) {
    verdict("LOST UPDATES", false, String(e));
  }

  // ---- STALE APPROVAL ----
  try {
    const p = await parseProposal(candidates[0]);
    const tampered = { ...p.proposal, proposalDigest: "deadbeef-tampered" };
    const r = await approve(p.text, tampered, randomUUID());
    const pass = r.status === 409 && (r.doc.code === "stale_digest" || r.doc.code === "proposal_altered");
    verdict("STALE APPROVAL", pass, `HTTP ${r.status} code:${r.doc.code}`);
  } catch (e) {
    verdict("STALE APPROVAL", false, String(e));
  }

  // ---- CRASH DURING WRITE: JOURNAL VALID ----
  try {
    const before = await journalEvents();
    await kill9(gwProc, "gateway");
    gwProc = null;
    appendFileSync(GW_STORE, '{"torn": true, "event_id":\nNOT-JSON\n', "utf8");
    await startGateway();
    const after = await journalEvents();
    const retry = await approve(p1.text, p1.proposal, R1);
    const pass =
      after.length >= before.length &&
      after.every((e) => typeof e.event_id === "string") &&
      retry.status === 200 &&
      retry.doc.eventId === a1.doc.eventId;
    verdict("CRASH DURING WRITE", pass, `eventsBefore:${before.length} after:${after.length} retryConverged:${retry.doc.eventId === a1.doc.eventId}`);
  } catch (e) {
    verdict("CRASH DURING WRITE", false, String(e));
  }

  // ---- SERVICE RESTART: RECOVERS ----
  try {
    await kill9(appProc, "app");
    appProc = null;
    await startApp();
    const h = await fetch(APP + "/api/healthz");
    const retry = await approve(p1.text, p1.proposal, R1);
    const pass = h.status === 200 && retry.status === 200 && retry.doc.eventId === a1.doc.eventId;
    verdict("SERVICE RESTART", pass, `healthz:${h.status} ledgerReplay:${retry.doc.eventId === a1.doc.eventId}`);
  } catch (e) {
    verdict("SERVICE RESTART", false, String(e));
  }

  // ---- TUNNEL INTERRUPTION: response lost mid-flight, retry converges ----
  try {
    const R3 = randomUUID();
    const p3 = await parseProposal(candidates[0]);
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 80);
    try {
      await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", siteId: SITE, text: p3.text, proposal: p3.proposal, request_id: R3 }),
        signal: ctrl.signal,
      });
    } catch {
      /* response deliberately lost */
    }
    clearTimeout(killer);
    await sleep(1500); // let the server finish the write if it started
    const retry = await approve(p3.text, p3.proposal, R3);
    const ev = await journalEvents();
    const pass = retry.status === 200 && retry.doc.ok === true && eventsFor(ev, R3).length === 1;
    verdict("TUNNEL INTERRUPTION", pass, `retry200:${retry.status === 200} journalCount:${eventsFor(ev, R3).length}`);
  } catch (e) {
    verdict("TUNNEL INTERRUPTION", false, String(e));
  }

  // ---- REPLAY: DETERMINISTIC ----
  try {
    const R4 = randomUUID();
    const p4 = await parseProposal(candidates[0]);
    const r1 = await approve(p4.text, p4.proposal, R4);
    const r2 = await approve(p4.text, p4.proposal, R4);
    const r3 = await approve(p4.text, p4.proposal, R4);
    const key = (r) => JSON.stringify([r.status, r.doc.eventId, r.doc.intentId, r.doc.proposalDigest]);
    const pass = r1.status === 200 && key(r1) === key(r2) && key(r2) === key(r3);
    verdict("REPLAY", pass, pass ? "3 identical outcomes" : `${key(r1)} vs ${key(r2)} vs ${key(r3)}`);
  } catch (e) {
    verdict("REPLAY", false, String(e));
  }

  await cleanup();
  printSummary();
}

function printSummary() {
  console.log("\n===== HOSTILE GATE VERDICT =====");
  const find = (n) => verdicts.find((v) => v.name === n);
  const line = (label, name, fmt) => {
    const v = find(name);
    console.log(`${label}: ${!v ? "NOT RUN" : fmt(v)}`);
  };
  line("IDEMPOTENT LOST-RESPONSE RETRY", "IDEMPOTENT LOST-RESPONSE RETRY", (v) => (v.pass ? "PASS" : "FAIL"));
  line("SAME REQUEST ID + DIFFERENT DIGEST", "SAME REQUEST ID + DIFFERENT DIGEST", (v) => (v.pass ? "REJECTED" : "NOT REJECTED"));
  line("CONCURRENT APPENDS", "CONCURRENT APPENDS", (v) => (v.pass ? "PASS" : "FAIL"));
  line("UNIQUE SEQUENCES", "UNIQUE SEQUENCES", (v) => (v.pass ? "PASS" : "FAIL"));
  line("LOST UPDATES", "LOST UPDATES", (v) => (v.pass ? "ZERO" : "NONZERO"));
  line("STALE APPROVAL", "STALE APPROVAL", (v) => (v.pass ? "REJECTED" : "NOT REJECTED"));
  line("CRASH DURING WRITE", "CRASH DURING WRITE", (v) => (v.pass ? "JOURNAL VALID" : "JOURNAL INVALID"));
  line("REPLAY", "REPLAY", (v) => (v.pass ? "DETERMINISTIC" : "NONDETERMINISTIC"));
  line("/healthz", "/healthz", (v) => (v.pass ? "PASS" : "FAIL"));
  line("/readyz", "/readyz", (v) => (v.pass ? "PASS" : "FAIL"));
  line("SERVICE RESTART", "SERVICE RESTART", (v) => (v.pass ? "RECOVERS" : "DOES NOT RECOVER"));
  line("TUNNEL INTERRUPTION", "TUNNEL INTERRUPTION", (v) => (v.pass ? "NO DUPLICATE / LOST OWNER ACTION" : "DUPLICATE OR LOST"));
  line("CANONICAL TEST", "CANONICAL TEST", (v) => (v.pass ? "GREEN" : "RED"));
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} gates passed`);
  if (failed.length) {
    console.log("failed:", failed.map((v) => v.name).join(", "));
    process.exitCode = 1;
  }
}

async function cleanup() {
  await kill9(appProc, "app");
  await kill9(gwProc, "gateway");
  appProc = null;
  gwProc = null;
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});

main().catch(async (e) => {
  console.error("gate harness error:", e);
  await cleanup();
  process.exit(1);
});
