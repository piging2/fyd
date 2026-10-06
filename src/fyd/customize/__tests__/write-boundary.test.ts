/**
 * Write-boundary P0 unit tests: digest, ledger, lock, and the idempotent
 * write orchestration with a fake journal. These prove the hostile-gate
 * behaviors that do not need a live server: replay, conflict, lost-update
 * zero under concurrency, and the UNKNOWN seam.
 */
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  IdempotencyLedger,
  SiteLock,
  UnknownOutcomeError,
  appendDiagnostic,
  canonicalPayloadDigest,
  newRequestId,
  runIdempotentWrite,
  type DeriveResult,
  type ExecuteResult,
  type WriteDeps,
} from "../write-boundary";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "wb-test-"));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fakeDeps(
  storeDir: string,
  opts: {
    requestId?: string;
    digest?: string;
    derive?: () => Promise<DeriveResult<{ n: number }>>;
    execute?: (d: { n: number }) => Promise<ExecuteResult>;
    shared?: { ledger: IdempotencyLedger; locks: SiteLock };
  } = {},
): { deps: WriteDeps<{ n: number }>; calls: { execute: number } } {
  const calls = { execute: 0 };
  const requestId = opts.requestId ?? newRequestId();
  const digest = opts.digest ?? canonicalPayloadDigest({ action: "approve", siteId: "s1", n: 1 });
  const deps: WriteDeps<{ n: number }> = {
    storeDir,
    // Production shares one ledger+lock pair per process (writeBoundaryStore
    // singleton). Concurrent same-process callers MUST share instances for
    // the in-process mutex to serialize them; pass `shared` for that.
    ledger: opts.shared?.ledger ?? new IdempotencyLedger(storeDir),
    locks: opts.shared?.locks ?? new SiteLock(storeDir),
    siteId: "s1",
    action: "approve",
    requestId,
    digest,
    derive: opts.derive ?? (async () => ({ ok: true, derived: { n: 1 } })),
    execute:
      opts.execute ??
      (async () => {
        calls.execute += 1;
        await sleep(10);
        return { eventId: `ev-${requestId.slice(0, 8)}`, deduped: false, fields: {} };
      }),
  };
  return { deps, calls };
}

describe("canonicalPayloadDigest", () => {
  test("deterministic and key-order independent", () => {
    const a = canonicalPayloadDigest({ action: "approve", siteId: "s1", text: "hi" });
    const b = canonicalPayloadDigest({ text: "hi", siteId: "s1", action: "approve" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  test("different payload -> different digest", () => {
    expect(canonicalPayloadDigest({ n: 1 })).not.toBe(canonicalPayloadDigest({ n: 2 }));
  });
});

describe("IdempotencyLedger", () => {
  test("miss returns undefined; record then lookup hits", () => {
    const dir = tempDir();
    const ledger = new IdempotencyLedger(dir);
    expect(ledger.lookup("nope")).toBeUndefined();
    const rid = newRequestId();
    ledger.record({
      v: 1,
      request_id: rid,
      digest: "d1",
      action: "approve",
      siteId: "s1",
      status: "recorded",
      result: { eventId: "ev-1" },
      at: new Date().toISOString(),
    });
    const hit = ledger.lookup(rid);
    expect(hit?.result.eventId).toBe("ev-1");
    expect(hit?.digest).toBe("d1");
  });
  test("corrupt lines are skipped, valid records survive reload", () => {
    const dir = tempDir();
    const rid = newRequestId();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "ledger.jsonl"),
      `not json at all\n{"request_id":"${rid}","digest":"d","action":"approve","siteId":"s","status":"recorded","result":{"eventId":"ev-9"},"at":"t","v":1}\n{"incomplete":\n`,
      "utf8",
    );
    const ledger = new IdempotencyLedger(dir);
    expect(ledger.size).toBe(1);
    expect(ledger.lookup(rid)?.result.eventId).toBe("ev-9");
  });
  test("last record wins on duplicate request_id", () => {
    const dir = tempDir();
    const ledger = new IdempotencyLedger(dir);
    const rid = newRequestId();
    const base = {
      v: 1,
      request_id: rid,
      digest: "d",
      action: "approve" as const,
      siteId: "s1",
      status: "recorded" as const,
      at: "t",
    };
    ledger.record({ ...base, result: { eventId: "ev-first" } });
    ledger.record({ ...base, result: { eventId: "ev-second" } });
    expect(ledger.lookup(rid)?.result.eventId).toBe("ev-second");
  });
});

describe("runIdempotentWrite", () => {
  test("miss -> derive -> execute -> committed; replay serves stored result without re-executing", async () => {
    const dir = tempDir();
    const rid = newRequestId();
    const { deps, calls } = fakeDeps(dir, { requestId: rid });
    const first = await runIdempotentWrite(deps);
    expect(first.kind).toBe("committed");
    expect(calls.execute).toBe(1);
    const eventId = first.kind === "committed" ? first.result.eventId : "";
    // Second run with a FRESH ledger instance (simulates process restart).
    const { deps: deps2, calls: calls2 } = fakeDeps(dir, { requestId: rid, digest: deps.digest });
    const second = await runIdempotentWrite(deps2);
    expect(second.kind).toBe("replayed");
    expect(calls2.execute).toBe(0);
    if (second.kind === "replayed") expect(second.result.eventId).toBe(eventId);
  });

  test("same request_id + different digest -> 409 conflict, execute not called", async () => {
    const dir = tempDir();
    const rid = newRequestId();
    const { deps } = fakeDeps(dir, { requestId: rid, digest: "digest-one" });
    const first = await runIdempotentWrite(deps);
    expect(first.kind).toBe("committed");
    const { deps: deps2, calls: calls2 } = fakeDeps(dir, { requestId: rid, digest: "digest-two" });
    const second = await runIdempotentWrite(deps2);
    expect(second.kind).toBe("conflict");
    if (second.kind === "conflict") {
      expect(second.expectedDigest).toBe("digest-one");
      expect(second.receivedDigest).toBe("digest-two");
    }
    expect(calls2.execute).toBe(0);
  });

  test("derive rejection -> rejected, execute not called, nothing recorded", async () => {
    const dir = tempDir();
    const { deps, calls } = fakeDeps(dir, {
      derive: async () => ({
        ok: false,
        failure: { code: "stale_digest", error: "moved", status: 409 },
      }),
    });
    const out = await runIdempotentWrite(deps);
    expect(out.kind).toBe("rejected");
    if (out.kind === "rejected") expect(out.failure.code).toBe("stale_digest");
    expect(calls.execute).toBe(0);
    expect(deps.ledger.lookup(deps.requestId)).toBeUndefined();
  });

  test("UNKNOWN seam: execute throws UnknownOutcomeError -> unknown, nothing recorded; retry converges", async () => {
    const dir = tempDir();
    const rid = newRequestId();
    const digest = canonicalPayloadDigest({ action: "approve", siteId: "s1" });
    // Fake gateway: records on first call, but the response is "lost".
    const journal = new Map<string, string>();
    const flakyExecute = async (): Promise<ExecuteResult> => {
      await sleep(5);
      if (!journal.has(rid)) {
        journal.set(rid, "ev-orig-1");
        throw new UnknownOutcomeError(rid, "socket destroyed after send");
      }
      return { eventId: journal.get(rid)!, deduped: true, fields: {} };
    };
    const { deps } = fakeDeps(dir, { requestId: rid, digest, execute: flakyExecute });
    const first = await runIdempotentWrite(deps);
    expect(first.kind).toBe("unknown");
    expect(deps.ledger.lookup(rid)).toBeUndefined(); // NOT recorded as failed
    expect(journal.get(rid)).toBe("ev-orig-1"); // but the journal HAS it

    const { deps: deps2 } = fakeDeps(dir, { requestId: rid, digest, execute: flakyExecute });
    const second = await runIdempotentWrite(deps2);
    expect(second.kind).toBe("committed");
    if (second.kind === "committed") {
      expect(second.result.eventId).toBe("ev-orig-1"); // converged on original
      expect(second.result.deduped).toBe(true);
    }
    expect(journal.size).toBe(1); // exactly one journaled effect
  });

  test("LOST UPDATES: ZERO — 10 concurrent same-request_id writes -> execute once, one eventId", async () => {
    const dir = tempDir();
    // Shared pair, exactly like the production singleton: this is what
    // makes the in-process mutex serialize the 10 racers.
    const shared = { ledger: new IdempotencyLedger(dir), locks: new SiteLock(dir) };
    const rid = newRequestId();
    const digest = canonicalPayloadDigest({ action: "approve", siteId: "s1" });
    let executeCalls = 0;
    const exec = async (): Promise<ExecuteResult> => {
      executeCalls += 1;
      await sleep(20); // force overlap
      return { eventId: "ev-single", deduped: false, fields: {} };
    };
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => {
        const { deps } = fakeDeps(dir, { requestId: rid, digest, execute: exec, shared });
        return runIdempotentWrite(deps);
      }),
    );
    expect(executeCalls).toBe(1);
    const eventIds = new Set(
      outcomes.map((o) => (o.kind === "committed" || o.kind === "replayed" ? o.result.eventId : "BAD")),
    );
    expect(eventIds).toEqual(new Set(["ev-single"]));
    expect(outcomes.filter((o) => o.kind === "committed")).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === "replayed")).toHaveLength(9);
  });

  test("LOST UPDATES: ZERO across instances — separate ledger/lock pairs still converge via lockfile + refresh", async () => {
    const dir = tempDir();
    const rid = newRequestId();
    const digest = canonicalPayloadDigest({ action: "approve", siteId: "s1" });
    let executeCalls = 0;
    const exec = async (): Promise<ExecuteResult> => {
      executeCalls += 1;
      await sleep(20);
      return { eventId: "ev-single-xproc", deduped: false, fields: {} };
    };
    // Deliberately separate instances per caller (no shared in-process
    // mutex): serialization must come from the lockfile, convergence from
    // refreshIfChanged inside the lock. This is the two-process shape.
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => {
        const { deps } = fakeDeps(dir, { requestId: rid, digest, execute: exec });
        return runIdempotentWrite(deps);
      }),
    );
    expect(executeCalls).toBe(1);
    const eventIds = new Set(
      outcomes.map((o) => (o.kind === "committed" || o.kind === "replayed" ? o.result.eventId : "BAD")),
    );
    expect(eventIds).toEqual(new Set(["ev-single-xproc"]));
  });

  test("CONCURRENT APPENDS: 10 distinct request_ids -> 10 executions, 10 unique eventIds", async () => {
    const dir = tempDir();
    let executeCalls = 0;
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const rid = newRequestId();
        const { deps } = fakeDeps(dir, {
          requestId: rid,
          digest: canonicalPayloadDigest({ action: "approve", siteId: "s1", i }),
          execute: async () => {
            executeCalls += 1;
            await sleep(15);
            return { eventId: `ev-${i}`, deduped: false, fields: {} };
          },
        });
        return runIdempotentWrite(deps);
      }),
    );
    expect(executeCalls).toBe(10);
    const eventIds = outcomes.map((o) => (o.kind === "committed" ? o.result.eventId : "BAD"));
    expect(new Set(eventIds).size).toBe(10); // UNIQUE SEQUENCES
    expect(outcomes.every((o) => o.kind === "committed")).toBe(true);
  });
});

describe("SiteLock", () => {
  test("serializes overlapping critical sections per site", async () => {
    const dir = tempDir();
    const locks = new SiteLock(dir);
    const order: string[] = [];
    await Promise.all(
      ["a", "b", "c"].map((name) =>
        locks.withLock("site-x", async () => {
          order.push(`enter-${name}`);
          await sleep(20);
          order.push(`exit-${name}`);
        }),
      ),
    );
    // No interleaving: each enter is immediately followed by its exit.
    for (let i = 0; i < order.length; i += 2) {
      const enter = order[i];
      const exit = order[i + 1];
      expect(exit).toBe(enter.replace("enter-", "exit-"));
    }
  });

  test("different sites do not block each other", async () => {
    const dir = tempDir();
    const locks = new SiteLock(dir);
    const start = Date.now();
    await Promise.all([
      locks.withLock("site-1", () => sleep(50)),
      locks.withLock("site-2", () => sleep(50)),
    ]);
    expect(Date.now() - start).toBeLessThan(90);
  });

  test("stale lockfile is reaped", async () => {
    const dir = tempDir();
    let reaped = "";
    const locks = new SiteLock(dir, (siteId) => {
      reaped = siteId;
    });
    const lockDir = join(dir, "locks");
    mkdirSync(lockDir, { recursive: true });
    const stale = join(lockDir, "site-stale.lock");
    writeFileSync(stale, "pid=99999", "utf8");
    // Backdate mtime beyond the stale threshold without touching internals:
    // (utimesSync is fine in tests)
    const { utimesSync } = await import("node:fs");
    const old = new Date(Date.now() - 120_000);
    utimesSync(stale, old, old);
    let ran = false;
    await locks.withLock("site-stale", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(reaped).toBe("site-stale");
  });

  test("lock is released after fn throws", async () => {
    const dir = tempDir();
    const locks = new SiteLock(dir);
    await expect(
      locks.withLock("site-e", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    let ran = false;
    await locks.withLock("site-e", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe("appendDiagnostic", () => {
  test("writes a subordinate JSONL line and never throws", () => {
    const dir = tempDir();
    appendDiagnostic(dir, { kind: "replay", request_id: "r1", siteId: "s1" });
    const lines = readFileSync(join(dir, "diagnostics.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const doc = JSON.parse(lines[0]);
    expect(doc.kind).toBe("replay");
    expect(doc.request_id).toBe("r1");
    expect(typeof doc.at).toBe("string");
    expect(() => appendDiagnostic("/nonexistent-dir-xyz/deep", { kind: "replay", request_id: "r", siteId: "s" })).not.toThrow();
  });
});
