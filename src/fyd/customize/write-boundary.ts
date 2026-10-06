/**
 * FYD write boundary: idempotent owner actions.
 *
 * PURE MODULE: no next/server, no route handler imports. All decision logic
 * lives here so the lane's jest scope (node environment) can test the real
 * flow with injected dependencies. The route layer
 * (src/app/api/fyd/customize/route.ts) is a thin adapter.
 *
 * Contract:
 *  - Client-generated request_id per owner action; server-computed canonical
 *    payload digest (the client never supplies the digest).
 *  - Same request_id + same digest  -> original result, no new event (replay).
 *  - Same request_id + different digest -> 409 CONFLICT (idempotency_conflict).
 *  - The derive -> verify -> append sequence runs under a per-site scoped
 *    lock (in-process mutex + lockfile), closing the TOCTOU in the
 *    optimistic proposal-digest precondition.
 *  - A journal POST whose outcome is unknown (timeout / lost response)
 *    surfaces as UNKNOWN, never as failure. Timeout never means failed.
 *  - Diagnostic JSONL is subordinate evidence only; never read for decisions.
 *
 * Crash model: the ledger is append-only JSONL; a crash between journal
 * append and ledger record is safe because the journal gateway dedupes on
 * request_id (tools/fyd-journal-gateway/server.mjs) — the retry converges
 * on the original event_id and the ledger is filled in then.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalize } from "@/lib/ping/ask-composer";

export const WRITE_BOUNDARY_VERSION = 1;
export const LEDGER_FILE = "ledger.jsonl";
export const DIAG_FILE = "diagnostics.jsonl";
export const LOCK_DIR = "locks";
const LOCK_STALE_MS = 60_000;
const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const LOCK_POLL_MS = 25;

/** Deterministic digest of the canonicalized payload. Server is the digest authority. */
export function canonicalPayloadDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

/** Mint a request_id for callers that did not supply one. */
export function newRequestId(): string {
  return randomUUID();
}

/** Thrown when a journal POST was sent but its outcome cannot be determined. */
export class UnknownOutcomeError extends Error {
  readonly requestId: string;
  constructor(requestId: string, detail: string) {
    super(
      `write-boundary: UNKNOWN outcome for request ${requestId}: ${detail}. ` +
        `The effect may have been recorded; retry with the same request_id to resolve.`,
    );
    this.name = "UnknownOutcomeError";
    this.requestId = requestId;
  }
}

export interface LedgerResult {
  eventId: string;
  deduped?: boolean;
  intentId?: string;
  proposalDigest?: string;
  specDigest?: string;
}

export interface LedgerRecord {
  v: number;
  request_id: string;
  digest: string;
  action: "approve" | "clear";
  siteId: string;
  status: "recorded";
  result: LedgerResult;
  at: string;
}

function isLedgerRecord(v: unknown): v is LedgerRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.request_id === "string" &&
    typeof r.digest === "string" &&
    (r.action === "approve" || r.action === "clear") &&
    typeof r.siteId === "string" &&
    r.status === "recorded" &&
    !!r.result &&
    typeof (r.result as Record<string, unknown>).eventId === "string"
  );
}

/**
 * Persistent idempotency ledger: request_id -> recorded result.
 * Append-only JSONL; corrupt lines are skipped on load, never fatal.
 * Only "recorded" outcomes are stored; UNKNOWN outcomes are retried
 * through the journal gateway's request_id dedupe instead.
 */
export class IdempotencyLedger {
  private readonly dir: string;
  private readonly file: string;
  private readonly map = new Map<string, LedgerRecord>();
  private loaded = false;
  private lastStat: { size: number; mtimeMs: number } | null = null;

  constructor(storeDir: string) {
    this.dir = storeDir;
    this.file = join(storeDir, LEDGER_FILE);
  }

  private snapshotStat(): void {
    try {
      const st = statSync(this.file);
      this.lastStat = { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      this.lastStat = null;
    }
  }

  load(): void {
    this.map.clear();
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, "utf8").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const rec: unknown = JSON.parse(t);
          if (isLedgerRecord(rec)) this.map.set(rec.request_id, rec); // last wins
        } catch {
          /* skip corrupt line, keep serving */
        }
      }
    }
    this.loaded = true;
    this.snapshotStat();
  }

  /**
   * Reload from disk if another writer (process or instance) changed the
   * file since our last read. Call inside the site lock before the
   * double-checked lookup so concurrent same-request_id writers converge.
   * Size is the reliable change signal (every record appends a line).
   */
  refreshIfChanged(): void {
    this.ensureLoaded();
    let changed = true;
    try {
      const st = statSync(this.file);
      changed =
        !this.lastStat || st.size !== this.lastStat.size || st.mtimeMs !== this.lastStat.mtimeMs;
    } catch {
      changed = this.lastStat !== null;
    }
    if (changed) this.load();
  }

  private ensureLoaded(): void {
    if (!this.loaded) this.load();
  }

  lookup(requestId: string): LedgerRecord | undefined {
    this.ensureLoaded();
    return this.map.get(requestId);
  }

  record(rec: LedgerRecord): void {
    this.ensureLoaded();
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.file, JSON.stringify(rec) + "\n", "utf8");
    this.map.set(rec.request_id, rec);
  }

  get size(): number {
    this.ensureLoaded();
    return this.map.size;
  }

  get path(): string {
    return this.file;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Scoped per-site lock: an in-process async mutex (serializes concurrent
 * requests in this server) plus a lockfile (O_CREAT|O_EXCL, stale after
 * 60s) for the cross-process dev-overlap case. Rationale for not using
 * PostgreSQL advisory locks: the FYD app has no pg dependency, the demo
 * journal is file-based by design, and the standing freeze forbids new
 * database infrastructure. This is the honest scoped lock for the
 * single-server topology.
 */
export class SiteLock {
  private readonly lockDir: string;
  private readonly chains = new Map<string, Promise<void>>();
  readonly onStaleReap: (siteId: string) => void;

  constructor(storeDir: string, onStaleReap?: (siteId: string) => void) {
    this.lockDir = join(storeDir, LOCK_DIR);
    this.onStaleReap = onStaleReap ?? (() => {});
  }

  private lockPath(siteId: string): string {
    const safe = siteId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "site";
    return join(this.lockDir, safe + ".lock");
  }

  private async acquireFile(siteId: string): Promise<void> {
    mkdirSync(this.lockDir, { recursive: true });
    const path = this.lockPath(siteId);
    const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
    for (;;) {
      try {
        const fd = openSync(path, "wx", 0o644);
        try {
          writeSync(fd, `pid=${process.pid} site=${siteId}`, 0, "utf8");
        } finally {
          closeSync(fd);
        }
        return;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") throw e;
        try {
          const st = statSync(path);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
            unlinkSync(path);
            this.onStaleReap(siteId);
            continue;
          }
        } catch {
          /* raced with another process; retry */
        }
        if (Date.now() >= deadline) {
          throw new Error(`write-boundary: site lock timeout for ${siteId}`);
        }
        await sleep(LOCK_POLL_MS);
      }
    }
  }

  private releaseFile(siteId: string): void {
    try {
      unlinkSync(this.lockPath(siteId));
    } catch {
      /* already gone */
    }
  }

  async withLock<T>(siteId: string, fn: () => Promise<T>): Promise<T> {
    // Wait on the PREVIOUS entry, never on our own: awaiting our own gate
    // would self-deadlock (the gate opens in the finally below).
    const prev = this.chains.get(siteId) ?? Promise.resolve();
    let release!: () => void;
    const cur = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Entry for the next acquirer: resolves when this holder releases.
    // It must never reject, or every later acquirer would hang.
    const entry = prev.then(() => cur).then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(siteId, entry);
    await prev;
    try {
      await this.acquireFile(siteId);
      try {
        return await fn();
      } finally {
        this.releaseFile(siteId);
      }
    } finally {
      release();
      if (this.chains.get(siteId) === entry) this.chains.delete(siteId);
    }
  }
}

export type DiagEvent =
  | { kind: "replay"; request_id: string; siteId: string }
  | { kind: "conflict"; request_id: string; siteId: string }
  | { kind: "unknown_outcome"; request_id: string; siteId: string; detail: string }
  | { kind: "stale_lock_reaped"; siteId: string }
  | { kind: "lock_timeout"; siteId: string };

/** Subordinate diagnostics: evidence for humans, never read for decisions. */
export function appendDiagnostic(storeDir: string, event: DiagEvent): void {
  try {
    mkdirSync(storeDir, { recursive: true });
    appendFileSync(
      join(storeDir, DIAG_FILE),
      JSON.stringify({ ...event, at: new Date().toISOString(), v: WRITE_BOUNDARY_VERSION }) + "\n",
      "utf8",
    );
  } catch {
    /* diagnostics never break the write path */
  }
}

export interface DerivedWrite<D> {
  derived: D;
}

export type DeriveResult<D> =
  | { ok: true; derived: D }
  | { ok: false; failure: VerifyFailure };

export interface VerifyFailure {
  code: string;
  error: string;
  status: number;
  extra?: Record<string, unknown>;
}

export interface ExecuteResult {
  eventId: string;
  deduped: boolean;
  fields: Partial<Omit<LedgerResult, "eventId" | "deduped">>;
}

export type WriteOutcome =
  | { kind: "replayed"; result: LedgerResult }
  | { kind: "conflict"; expectedDigest: string; receivedDigest: string }
  | { kind: "committed"; result: LedgerResult }
  | { kind: "unknown"; requestId: string }
  | { kind: "rejected"; failure: VerifyFailure };

export interface WriteDeps<D> {
  storeDir: string;
  ledger: IdempotencyLedger;
  locks: SiteLock;
  siteId: string;
  action: "approve" | "clear";
  requestId: string;
  digest: string;
  /** Re-derive from current state and run the optimistic precondition checks. */
  derive: () => Promise<DeriveResult<D>>;
  /** Journal the derived write. Must send requestId to the gateway. */
  execute: (derived: D) => Promise<ExecuteResult>;
}

function diag(storeDir: string, event: DiagEvent): void {
  appendDiagnostic(storeDir, event);
}

/**
 * The idempotent write flow. Pure orchestration over injected dependencies:
 * the lane's tests drive this with a fake journal to prove the hostile
 * gate behaviors (replay, conflict, lost-update-zero, unknown seam).
 */
export async function runIdempotentWrite<D>(deps: WriteDeps<D>): Promise<WriteOutcome> {
  const { storeDir, ledger, locks, siteId, action, requestId, digest } = deps;

  const fastPath = ledger.lookup(requestId);
  if (fastPath) {
    if (fastPath.digest === digest) {
      diag(storeDir, { kind: "replay", request_id: requestId, siteId });
      return { kind: "replayed", result: fastPath.result };
    }
    diag(storeDir, { kind: "conflict", request_id: requestId, siteId });
    return { kind: "conflict", expectedDigest: fastPath.digest, receivedDigest: digest };
  }

  return locks.withLock(siteId, async (): Promise<WriteOutcome> => {
    // Double-checked inside the lock: a concurrent same-request_id write
    // may have committed while we queued. Refresh from disk first so the
    // check sees records written by other processes/instances, then replay
    // instead of duplicating. This refresh is what makes LOST UPDATES: ZERO
    // hold beyond a single process.
    ledger.refreshIfChanged();
    const recheck = ledger.lookup(requestId);
    if (recheck) {
      if (recheck.digest === digest) {
        diag(storeDir, { kind: "replay", request_id: requestId, siteId });
        return { kind: "replayed", result: recheck.result };
      }
      diag(storeDir, { kind: "conflict", request_id: requestId, siteId });
      return { kind: "conflict", expectedDigest: recheck.digest, receivedDigest: digest };
    }

    const d = await deps.derive();
    if (!d.ok) return { kind: "rejected", failure: d.failure };

    let exec: ExecuteResult;
    try {
      exec = await deps.execute(d.derived);
    } catch (e) {
      if (e instanceof UnknownOutcomeError) {
        diag(storeDir, {
          kind: "unknown_outcome",
          request_id: requestId,
          siteId,
          detail: e.message.slice(0, 300),
        });
        // Deliberately NOT recorded: the retry re-derives and re-POSTs with
        // the same request_id; the gateway dedupe converges on the original
        // event. Recording an UNKNOWN here would poison the replay path.
        return { kind: "unknown", requestId };
      }
      throw e;
    }

    const result: LedgerResult = {
      eventId: exec.eventId,
      ...(exec.deduped ? { deduped: true as const } : {}),
      ...exec.fields,
    };
    ledger.record({
      v: WRITE_BOUNDARY_VERSION,
      request_id: requestId,
      digest,
      action,
      siteId,
      status: "recorded",
      result,
      at: new Date().toISOString(),
    });
    return { kind: "committed", result };
  });
}

/** Default store dir: <cwd>/data/fyd-idempotency, overridable for tests. */
export function resolveStoreDir(): string {
  return process.env.FYD_WRITE_BOUNDARY_STORE ?? join(process.cwd(), "data", "fyd-idempotency");
}

const singletons = new Map<string, { ledger: IdempotencyLedger; locks: SiteLock }>();

/** Process-wide ledger+lock pair for the route layer. Tests construct their own. */
export function writeBoundaryStore(storeDir?: string): {
  storeDir: string;
  ledger: IdempotencyLedger;
  locks: SiteLock;
} {
  const dir = storeDir ?? resolveStoreDir();
  let s = singletons.get(dir);
  if (!s) {
    s = {
      ledger: new IdempotencyLedger(dir),
      locks: new SiteLock(dir, (siteId) =>
        appendDiagnostic(dir, { kind: "stale_lock_reaped", siteId }),
      ),
    };
    singletons.set(dir, s);
  }
  return { storeDir: dir, ledger: s.ledger, locks: s.locks };
}
