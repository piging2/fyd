/**
 * pg-store.mjs — Postgres backing store for the FYD journal gateway.
 *
 * The SAME journal contract as the JSONL store (see server.mjs), with the
 * store behind it selected by environment:
 *   FYD_JOURNAL_PG_URL (preferred) or DATABASE_URL set -> this Postgres backend
 *   neither set                                          -> the JSONL backend
 * Semantics do not change with the backing. The same code runs against a
 * local Postgres (tests) and later a managed Postgres (Neon); only the
 * connection string differs.
 *
 * Postgres requirements (from the 2026-10-03 journal archaeology):
 *   - ordinary PostgreSQL, plpgsql only (default extension). No extensions,
 *     no triggers, no migration framework. Idempotent DDL runs in code at
 *     boot (CREATE TABLE/INDEX IF NOT EXISTS), the same pattern as
 *     UnifiedEventRuntime.initialize() on the main PING journal.
 *   - `pg` is already a declared dependency of this repo (package.json);
 *     it is imported LAZILY here so the JSONL backend keeps its
 *     zero-dependency property. The PG backend fails closed at boot with a
 *     clear message when `pg` is not resolvable.
 *   - TLS is negotiated by `pg` from the connection string
 *     (?sslmode=require / verify-full for managed Postgres).
 *
 * Dedupe (the multi-instance latent fix):
 *   The old JSONL backend kept request_id -> { tenantId, eventId } in a
 *   per-process Map rebuilt from disk at startup. Two gateway processes
 *   (e.g. Vercel instances) could both pass the check and double-append.
 *   Here the binding lives in a partial unique index:
 *     UNIQUE (request_id) WHERE request_id IS NOT NULL
 *   Append is a single INSERT ... ON CONFLICT (request_id)
 *   WHERE request_id IS NOT NULL DO NOTHING, so check-and-append is atomic
 *   across processes and restarts. On conflict the conflicting row is
 *   re-read: same tenant -> { event_id, deduped: true }; different tenant
 *   (or a legacy row with no tenant) -> request_id_tenant_conflict with
 *   zero disclosure of the original event_id.
 *
 *   The index is on request_id ALONE (not (tenant_id, request_id)): the
 *   JSONL contract binds a request_id to the FIRST tenant that used it
 *   (rebuildRequestIndex is first-record-wins), and a composite index
 *   would let a cross-tenant race journal a second row before the app
 *   check could refuse it. The global index makes first-record-wins
 *   atomic.
 *
 * Record shape (identical to the JSONL contract):
 *   { event_id, timestamp, event_type, tenant_id, aggregate_id,
 *     aggregate_type, event_data, request_id }
 * Canonical order is (timestamp, event_id) ascending; the overlay reducer
 * is order-dependent by design, so reads always ORDER BY timestamp,
 * event_id. Timestamps are minted by the gateway (ISO-8601 millis, same
 * as the JSONL backend) and round-tripped through timestamptz.
 */

const DDL_TABLE = `
CREATE TABLE IF NOT EXISTS fyd_journal_events (
  event_id       text PRIMARY KEY,
  timestamp      timestamptz NOT NULL DEFAULT now(),
  event_type     text NOT NULL,
  tenant_id      text NULL CHECK (tenant_id IS NULL OR tenant_id ~ '^[a-z0-9-]{1,64}$'),
  aggregate_id   text NULL,
  aggregate_type text NULL,
  event_data     jsonb NOT NULL,
  request_id     text NULL
)`;

const DDL_DEDUPE_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS fyd_journal_events_request_uidx
  ON fyd_journal_events (request_id) WHERE request_id IS NOT NULL`;

const DDL_READ_INDEX = `
CREATE INDEX IF NOT EXISTS fyd_journal_events_read_idx
  ON fyd_journal_events (event_type, tenant_id, timestamp, event_id)`;

// timestamptz -> "2026-10-03T06:55:40.123Z" (same shape as Date.toISOString)
const TS_OUT = `to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = `event_id, ${TS_OUT} AS timestamp, event_type, tenant_id, aggregate_id, aggregate_type, event_data, request_id`;

let pgModule = null;
async function pg() {
  if (!pgModule) {
    try {
      pgModule = await import("pg");
    } catch (e) {
      throw new Error(
        "fyd-journal-gateway: Postgres backend selected " +
          "(FYD_JOURNAL_PG_URL/DATABASE_URL is set) but the 'pg' module is not " +
          "resolvable from the gateway directory. The JSONL backend needs no " +
          "dependencies; the Postgres backend needs this repo's node_modules " +
          "(pg ^8.23.1). Original error: " +
          (e && e.message ? e.message : String(e)),
      );
    }
  }
  return pgModule;
}

/** "host:port/dbname" with credentials stripped; safe for logs and GET /. */
export function redactPgUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname + (u.port ? ":" + u.port : "");
    const db = u.pathname.replace(/^\//, "") || "?";
    return `${u.protocol}//${host}/${db}`;
  } catch {
    return "pg:unparseable-url";
  }
}

export class RequestIdTenantConflict extends Error {
  constructor() {
    super("request_id is already bound to a different tenant");
    this.code = "request_id_tenant_conflict";
  }
}

export async function initPgStore(pgUrl) {
  const { Pool } = await pg();
  const pool = new Pool({ connectionString: pgUrl, max: 4 });
  // Fail fast at boot when the database is unreachable or the DDL cannot
  // run: a journal that cannot prove its store must not serve reads.
  let boot;
  try {
    boot = await pool.connect();
  } catch (e) {
    await pool.end().catch(() => {});
    throw new Error(
      "fyd-journal-gateway: cannot reach Postgres at " +
        redactPgUrl(pgUrl) +
        " (" +
        (e && e.message ? e.message : String(e)) +
        ")",
    );
  }
  try {
    await boot.query(DDL_TABLE);
    await boot.query(DDL_DEDUPE_INDEX);
    await boot.query(DDL_READ_INDEX);
  } finally {
    boot.release();
  }

  const identity = "pg:" + redactPgUrl(pgUrl);

  return {
    kind: "pg",

    /** Live-derived backing identity for the FYD-037 journal marker. */
    identity: () => identity,

    /** Non-secret backing label for GET / `store`. */
    storeLabel: () => identity,

    /**
     * Paged read in canonical (timestamp, event_id) order.
     * tenant=null keeps the legacy unfiltered stream shape.
     */
    loadPage: async ({ stream, tenant, limit, offset }) => {
      let text;
      let params;
      if (tenant) {
        text =
          `SELECT ${COLS} FROM fyd_journal_events ` +
          `WHERE event_type = $1 AND tenant_id = $2 ` +
          `ORDER BY timestamp ASC, event_id ASC LIMIT $3 OFFSET $4`;
        params = [stream, tenant, limit, offset];
      } else {
        text =
          `SELECT ${COLS} FROM fyd_journal_events ` +
          `WHERE event_type = $1 ` +
          `ORDER BY timestamp ASC, event_id ASC LIMIT $3 OFFSET $2`;
        params = [stream, limit, offset];
      }
      const r = await pool.query(text, params);
      return r.rows.map((row) => ({
        event_id: row.event_id,
        timestamp: row.timestamp,
        event_type: row.event_type,
        tenant_id: row.tenant_id,
        aggregate_id: row.aggregate_id,
        aggregate_type: row.aggregate_type,
        event_data: row.event_data,
        request_id: row.request_id,
      }));
    },

    /**
     * Atomic append with request_id dedupe.
     * Resolves { event_id, deduped }. Throws RequestIdTenantConflict on a
     * cross-tenant (or legacy tenant-less) request_id binding; the
     * conflicting event_id is never disclosed.
     */
    append: async (rec) => {
      const ins = await pool.query(
        `INSERT INTO fyd_journal_events
           (event_id, timestamp, event_type, tenant_id, aggregate_id, aggregate_type, event_data, request_id)
         VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
         RETURNING event_id`,
        [
          rec.event_id,
          rec.timestamp,
          rec.event_type,
          rec.tenant_id,
          rec.aggregate_id,
          rec.aggregate_type,
          JSON.stringify(rec.event_data),
          rec.request_id,
        ],
      );
      if (ins.rowCount === 1) {
        return { event_id: rec.event_id, deduped: false };
      }
      // A row already holds this request_id. Same tenant -> idempotent
      // replay; anything else -> conflict, zero disclosure.
      if (!rec.request_id) {
        throw new Error(
          "fyd-journal-gateway: insert conflicted without a request_id (duplicate event_id?)",
        );
      }
      const prior = await pool.query(
        `SELECT event_id, tenant_id FROM fyd_journal_events WHERE request_id = $1`,
        [rec.request_id],
      );
      const row = prior.rows[0];
      if (row && row.tenant_id !== null && row.tenant_id === rec.tenant_id) {
        return { event_id: row.event_id, deduped: true };
      }
      throw new RequestIdTenantConflict();
    },
  };
}
