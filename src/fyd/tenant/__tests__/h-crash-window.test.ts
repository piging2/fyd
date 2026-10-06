/**
 * (h) CRASH-WINDOW: what a crash between intent-accept and commit leaves behind.
 *
 * Two commit paths are under test, both with fixtures only:
 *
 *  1. The FYD journal gateway (tools/fyd-journal-gateway/server.mjs):
 *     commit = one synchronous appendFileSync of a JSONL line.
 *     - TORN WRITE: a kill -9 landing mid-append leaves a partial line.
 *       Simulated by appending a truncated line directly to the store file.
 *       The gateway must never present it as a committed event, must not
 *       resurrect it into the request_id index on restart, and must not
 *       leak its (tenant B) bytes to tenant A reads.
 *     - COMMIT-BEFORE-RESPONSE: a kill -9 landing after the append but
 *       before the HTTP response. Simulated by writing a fully-formed
 *       record line directly to the store (bypassing the gateway, exactly
 *       what the crashed process left on disk), then starting the gateway.
 *       A client retry with the same request_id must converge:
 *       deduped:true with the ORIGINAL event_id, no duplicate append.
 *
 *  2. The owner event log (src/fyd/object/owner-events.ts):
 *     commit = writeFileSync(tmp) + renameSync(tmp, canonical path).
 *     An exception injected at the rename (the commit boundary) must leave
 *     the canonical file untouched: reads show only the old committed
 *     state, the next successful append continues the sequence with no
 *     gap, and no other tenant's file is touched.
 *
 * What this does NOT prove: a real SIGKILL at the exact machine instruction
 * (approximated by direct store-file surgery instead), OS/filesystem-level
 * durability (no fsync is used; POSIX rename atomicity is relied upon), or
 * the main PING gateway (:8080), which is a separate deployment.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyOwnerCommand, readOverrides } from "@/fyd/object/owner-store";
import { installDirOverrides, makeTempDir } from "./helpers";

/**
 * Commit-boundary fault injection: node's built-in fs exports are
 * non-configurable in this runtime, so jest.spyOn(fs, "renameSync")
 * throws "Cannot redefine property". Intercept at the module registry
 * instead. The one-shot flag is armed by the test right before the call
 * under test; every other renameSync delegates to the real one.
 */
declare global {
  // eslint-disable-next-line no-var
  var __fydCrashAtRename: boolean | undefined;
}
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs") as typeof import("node:fs");
  return {
    ...actual,
    renameSync: (oldPath: string, newPath: string) => {
      if (globalThis.__fydCrashAtRename) {
        globalThis.__fydCrashAtRename = false;
        throw new Error("simulated crash at commit boundary");
      }
      return actual.renameSync(oldPath, newPath);
    },
  };
});

const GATEWAY = resolve(
  __dirname,
  "../../../../tools/fyd-journal-gateway/server.mjs",
);

// Synthetic write credential for the spawned gateway (Mission K contract:
// POST /events requires Authorization: Bearer <FYD_JOURNAL_WRITE_TOKEN>).
const WRITE_TOKEN = "fyd-journal-test-write-token";

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const addr = s.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

interface Gw {
  base: string;
  proc: ChildProcess;
  close: () => Promise<void>;
}

async function startGateway(store: string): Promise<Gw> {
  const port = await freePort();
  const proc = spawn("node", [GATEWAY], {
    env: {
      ...process.env,
      FYD_JOURNAL_PORT: String(port),
      FYD_JOURNAL_HOST: "127.0.0.1",
      FYD_JOURNAL_STORE: store,
      FYD_JOURNAL_WRITE_TOKEN: WRITE_TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const res = await fetch(base + "/");
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error("gateway did not come up on " + base);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base,
    proc,
    close: async () => {
      proc.kill();
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}

async function postEvent(
  base: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(base + "/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${WRITE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function getEvents(
  base: string,
  tenant: string,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    base + "/events/FYD_SITE_OVERLAY?tenant=" + encodeURIComponent(tenant),
  );
  const doc = (await res.json()) as { events: Record<string, unknown>[] };
  return doc.events;
}

describe("crash window: journal gateway", () => {
  let storeDir: string;
  let store: string;
  let gw: Gw | null = null;

  beforeEach(() => {
    storeDir = mkdtempSync(join(tmpdir(), "fyd-crash-journal-"));
    store = join(storeDir, "events.jsonl");
    writeFileSync(store, "");
  });

  afterEach(async () => {
    if (gw) {
      await gw.close();
      gw = null;
    }
  });

  /**
   * Seed one committed event per tenant, then simulate kill -9
   * mid-appendFileSync by appending a truncated line directly to the
   * store file. Returns the gateway (restarted, index rebuilt) and the
   * committed event ids.
   */
  async function seedAndTear(): Promise<{
    aId: unknown;
    bId: unknown;
  }> {
    gw = await startGateway(store);
    const a1 = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-a",
      aggregate_id: "fyd-site:site-a",
      event_data: { siteId: "site-a", op: "a-commit-1" },
      request_id: "crash-a1",
    });
    expect(a1.json.deduped).toBe(false);
    const b1 = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-b",
      aggregate_id: "fyd-site:site-b",
      event_data: { siteId: "site-b", op: "b-commit-1" },
      request_id: "crash-b1",
    });
    expect(b1.json.deduped).toBe(false);
    await gw.close();
    gw = null;

    // Simulate kill -9 mid-appendFileSync: a truncated line for tenant B,
    // carrying a request_id that was "accepted" but never committed.
    // NOTE: no trailing newline, exactly what a torn write() leaves.
    appendFileSync(
      store,
      '{"event_id":"fyd-ovl-TORN","tenant_id":"site-b",' +
        '"request_id":"crash-torn","event_data":{"siteId":"site-b","op":"torn"',
      "utf8",
    );

    // "Restart" the gateway: it rebuilds the request_id index from disk.
    gw = await startGateway(store);
    return { aId: a1.json.event_id, bId: b1.json.event_id };
  }

  test("torn write: the partial line is never presented, never indexed, never leaked", async () => {
    const { aId, bId } = await seedAndTear();
    if (!gw) throw new Error("gateway not started");

    // 1. The torn line is never presented as a committed event, and its
    //    tenant-B bytes never leak into tenant A's reads.
    const eventsA = await getEvents(gw.base, "site-a");
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].event_id).toBe(aId);
    const eventsB = await getEvents(gw.base, "site-b");
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0].event_id).toBe(bId);
    for (const e of [...eventsA, ...eventsB]) {
      expect(String(e.event_id)).not.toContain("TORN");
    }

    // 2. The torn request_id was not resurrected into the index: the
    //    client retry is treated as a NEW event, not a dedupe of a
    //    phantom commit.
    const retryTorn = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-b",
      aggregate_id: "fyd-site:site-b",
      event_data: { siteId: "site-b", op: "b-retry-after-torn" },
      request_id: "crash-torn",
    });
    expect(retryTorn.status).toBe(200);
    expect(retryTorn.json.deduped).toBe(false);
  });

  test("RED FINDING (pinned defect): a newline-less torn write poisons the next append", async () => {
    // The gateway appends `JSON.stringify(rec) + "\n"` with no framing.
    // When the torn line lacks its trailing newline, the next append is
    // concatenated onto the partial line, producing one corrupt line that
    // the reader skips. The client was told deduped:false (accepted) for
    // an event that will NEVER be served, and the request_id is now bound
    // to that phantom event_id, so further retries dedupe instead of
    // repairing. Evidence: this test's GET shows the retried event missing.
    //
    // Suggested fix (owning lane): before appending, if the store is
    // non-empty and does not end with "\n", write the separator first;
    // or frame records so a torn tail cannot swallow the next record.
    // When fixed, fold this case back into the test above.
    await seedAndTear();
    if (!gw) throw new Error("gateway not started");

    const retryTorn = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-b",
      aggregate_id: "fyd-site:site-b",
      event_data: { siteId: "site-b", op: "b-retry-after-torn" },
      request_id: "crash-torn",
    });
    expect(retryTorn.status).toBe(200);
    expect(retryTorn.json.deduped).toBe(false);
    const phantomId = retryTorn.json.event_id;

    // The accepted event is not servable: still exactly the 1 committed event.
    const eventsB = await getEvents(gw.base, "site-b");
    expect(eventsB).toHaveLength(1);
    expect(eventsB.map((e) => e.event_id)).not.toContain(phantomId);

    // And the phantom is now pinned in the dedupe index: a further retry
    // converges on the unservable event instead of repairing.
    const retryAgain = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-b",
      aggregate_id: "fyd-site:site-b",
      event_data: { siteId: "site-b", op: "b-retry-again" },
      request_id: "crash-torn",
    });
    expect(retryAgain.json.deduped).toBe(true);
    expect(retryAgain.json.event_id).toBe(phantomId);
  });

  test("crash after commit, before response: retry converges with no duplicate", async () => {
    const { aId } = await seedAndTear();
    if (!gw) throw new Error("gateway not started");

    // A committed event's request_id still dedupes after restart
    // (crash after commit, before response, converges).
    const retryA1 = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-a",
      aggregate_id: "fyd-site:site-a",
      event_data: { siteId: "site-a", op: "a-retry" },
      request_id: "crash-a1",
    });
    expect(retryA1.json.deduped).toBe(true);
    expect(retryA1.json.event_id).toBe(aId);
    const eventsA = await getEvents(gw.base, "site-a");
    expect(eventsA).toHaveLength(1); // no duplicate appended
  });

  test("commit-before-response: record on disk without a response converges on retry", async () => {
    // The crashed process left a FULLY-FORMED record on disk (append
    // completed) but never sent the HTTP response. Write it exactly as
    // the gateway would have.
    const committedLine = JSON.stringify({
      event_id: "fyd-ovl-COMMITTED",
      timestamp: "2026-09-25T12:00:00.000Z",
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-a",
      aggregate_id: "fyd-site:site-a",
      aggregate_type: "fyd-site",
      event_data: { siteId: "site-a", op: "a-commit-before-response" },
      request_id: "crash-r2",
    });
    appendFileSync(store, committedLine + "\n", "utf8");

    gw = await startGateway(store);

    // The client's retry with the same request_id converges: the original
    // event_id is returned, deduped:true, and NOTHING new is appended.
    const retry = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-a",
      aggregate_id: "fyd-site:site-a",
      event_data: { siteId: "site-a", op: "a-retry" },
      request_id: "crash-r2",
    });
    expect(retry.status).toBe(200);
    expect(retry.json.deduped).toBe(true);
    expect(retry.json.event_id).toBe("fyd-ovl-COMMITTED");
    const events = await getEvents(gw.base, "site-a");
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe("fyd-ovl-COMMITTED");

    // A different tenant reusing the request_id learns nothing.
    const hostile = await postEvent(gw.base, {
      event_type: "FYD_SITE_OVERLAY",
      tenant_id: "site-b",
      aggregate_id: "fyd-site:site-b",
      event_data: { siteId: "site-b", op: "b-hostile" },
      request_id: "crash-r2",
    });
    expect(hostile.status).toBe(400);
    expect(hostile.json.error).toBe("request_id_tenant_conflict");
    expect(JSON.stringify(hostile.json)).not.toContain("fyd-ovl-COMMITTED");
  });
});

describe("crash window: owner event log commit boundary", () => {
  let dir: string;
  let restoreEnv: () => void;

  const CMD = {
    type: "set-contact-field",
    field: "phone",
    value: "555-019-2837",
  } as const;

  beforeEach(() => {
    dir = makeTempDir("fyd-crash-owner-");
    restoreEnv = installDirOverrides({ FYD_OWNER_DIR: dir });
    // Committed baseline for tenant A and tenant B.
    applyOwnerCommand("site-a", CMD, [], new Map(), {
      actorLabel: "crash-window-test",
    });
    applyOwnerCommand(
      "site-b",
      { type: "set-contact-field", field: "phone", value: "555-010-9999" },
      [],
      new Map(),
      { actorLabel: "crash-window-test" },
    );
  });

  afterEach(() => {
    globalThis.__fydCrashAtRename = false;
    restoreEnv();
  });

  test("exception at the rename leaves the old committed state intact and the sequence unbroken", () => {
    const beforeA = readFileSync(join(dir, "site-a.json"), "utf8");
    const beforeB = readFileSync(join(dir, "site-b.json"), "utf8");
    const oldOverrides = readOverrides("site-a");
    expect(oldOverrides.fieldCorrections?.["phone"]?.ownerValue).toBe("555-019-2837");
    const oldHistoryLen = oldOverrides.history.length;

    // Inject the crash at the commit boundary: tmp is written, rename dies.
    globalThis.__fydCrashAtRename = true;
    let err: unknown = null;
    try {
      applyOwnerCommand(
        "site-a",
        { type: "set-contact-field", field: "phone", value: "555-000-0000" },
        [],
        new Map(),
        { actorLabel: "crash-window-test" },
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(globalThis.__fydCrashAtRename).toBe(false); // the fault fired exactly once

    // No half-written state is presented as committed: the canonical file
    // is byte-identical to before, reads show only the old state.
    expect(readFileSync(join(dir, "site-a.json"), "utf8")).toBe(beforeA);
    const after = readOverrides("site-a");
    expect(after.fieldCorrections?.["phone"]?.ownerValue).toBe("555-019-2837");
    expect(after.history).toHaveLength(oldHistoryLen);

    // No cross-tenant residue: tenant B's file is untouched.
    expect(readFileSync(join(dir, "site-b.json"), "utf8")).toBe(beforeB);

    // Recovery: the next successful append continues the sequence with no
    // gap and no duplicate.
    const beforeEvents = JSON.parse(beforeA).events as unknown[];
    const applied = applyOwnerCommand(
      "site-a",
      { type: "set-contact-field", field: "phone", value: "555-000-0000" },
      [],
      new Map(),
      { actorLabel: "crash-window-test" },
    );
    const afterEvents = JSON.parse(readFileSync(join(dir, "site-a.json"), "utf8"))
      .events as { seq: number }[];
    expect(afterEvents).toHaveLength(beforeEvents.length + 1);
    expect(afterEvents[afterEvents.length - 1].seq).toBe(beforeEvents.length);
    expect(applied.fieldCorrections?.["phone"]?.ownerValue).toBe("555-000-0000");
  });
});
