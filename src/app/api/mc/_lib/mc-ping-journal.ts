/**
 * READ-ONLY path from the served Mission Control to the live PING journal.
 *
 * Pig plane: brain-postgres / ping_runtime.ping_events (+ ping_missions,
 * knowledge_nodes). This module NEVER writes: every statement is a SELECT,
 * enforced by the query() guard below (anything not starting with SELECT
 * or WITH throws). No INSERT/UPDATE/DELETE/DDL exists in this file.
 *
 * Same-plane access: the docker-internal hostname `brain-postgres` does not
 * resolve from WSL; brain-postgres maps 5432/tcp to 0.0.0.0:5432 on the Pig,
 * so the WSL-side endpoint 127.0.0.1:5432 IS brain-postgres's ping_runtime
 * (proven by the 2026-09-30 deployment-convergence readback, 2580 rows).
 *
 * Credential: POSTGRES_PASSWORD is read at runtime from the live
 * ping-gateway container's own docker env (same-plane config, cached in
 * module scope, never logged, never returned to callers).
 *
 * Lane: MarketingOS projection (MC writer, 2026-09-30). No new authority,
 * no new store: this is a read adapter over the existing journal.
 */

import { execFileSync } from 'child_process';
import { Pool } from 'pg';
import type { QueueMissionInput } from './mc-queue-project';

export const PING_JOURNAL_SOURCE =
  'brain-postgres / ping_runtime.ping_events (Pig plane, read-only)';

/** Mission id shape accepted by the projection routes. */
export const MISSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export interface PingJournalEvent {
  event_id: string;
  event_type: string;
  source: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  namespace: string | null;
  tenant_id: string | null;
}

export interface PingMissionRow {
  mission_id: string;
  mission_type: string | null;
  status: string | null;
  priority: number | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  tenant_id: string | null;
}

export interface KnowledgeNodeRow {
  node_id: string;
  node_type: string;
  label: string | null;
  data: Record<string, unknown> | null;
  source_event_id: string | null;
  correlation_id: string | null;
  confidence: number | null;
  created_at: string | null;
}

export interface MarketingOSCanonicalState {
  /** The requested mission row first, then any missions whose payload mentions it. */
  missions: PingMissionRow[];
  /** Events whose payload references the mission id, ordered (timestamp, event_id). */
  events: PingJournalEvent[];
  /** Knowledge nodes correlated to the mission id. */
  knowledge_nodes: KnowledgeNodeRow[];
}

let passwordCache: string | null = null;

function dbPassword(): string {
  if (passwordCache !== null) return passwordCache;
  // Same-plane config: the live gateway's own container env. The value is
  // used only as the pg Pool password and is never logged or returned.
  const env = execFileSync(
    'docker',
    ['inspect', 'ping-gateway', '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
    { encoding: 'utf8', timeout: 15000 },
  );
  const line = env
    .split('\n')
    .find((l) => l.startsWith('POSTGRES_PASSWORD='));
  if (!line) throw new Error('ping_journal_credential_missing');
  passwordCache = line.slice('POSTGRES_PASSWORD='.length);
  if (passwordCache.length === 0) throw new Error('ping_journal_credential_missing');
  return passwordCache;
}

let poolCache: Pool | null = null;

function pool(): Pool {
  if (poolCache !== null) return poolCache;
  poolCache = new Pool({
    host: '127.0.0.1', // port-mapped brain-postgres on this plane (see header)
    port: 5432,
    user: 'postgres',
    password: dbPassword(),
    database: 'ping_runtime',
    max: 3,
    connectionTimeoutMillis: 8000,
    // Belt and suspenders: the driver-level default is read-only too, so
    // even a future edit that forgets the query() guard cannot write.
    options: '-c default_transaction_read_only=on',
  });
  return poolCache;
}

const READ_ONLY_RE = /^\s*(select|with)\b/i;

/** Read-only query gate: rejects anything that is not a SELECT/WITH. */
async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!READ_ONLY_RE.test(text)) {
    throw new Error('ping_journal_write_blocked: non-read statement refused');
  }
  let p: Pool;
  try {
    p = pool();
  } catch (e) {
    throw new Error(`ping_journal_unreachable: ${String(e).slice(0, 120)}`);
  }
  try {
    const r = await p.query(text, params as unknown[]);
    return r.rows as T[];
  } catch (e) {
    throw new Error(`ping_journal_unreachable: ${String(e).slice(0, 160)}`);
  }
}

const MISSION_COLS = `mission_id, mission_type, status, priority, payload, result,
  assigned_to, created_by, created_at, started_at, completed_at, error, tenant_id`;

/**
 * Normalize any DB timestamp to ISO. pg returns timestamptz as a JS Date;
 * String(date) would produce a locale string that breaks the projection's
 * as_of horizon comparison (as_of is ISO). ISO strings compare correctly.
 */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function toMissionRow(r: Record<string, unknown>): PingMissionRow {
  return {
    mission_id: String(r.mission_id),
    mission_type: (r.mission_type as string) ?? null,
    status: (r.status as string) ?? null,
    priority: (r.priority as number) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? null,
    result: (r.result as Record<string, unknown>) ?? null,
    assigned_to: (r.assigned_to as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: iso(r.created_at),
    started_at: iso(r.started_at),
    completed_at: iso(r.completed_at),
    error: (r.error as string) ?? null,
    tenant_id: (r.tenant_id as string) ?? null,
  };
}

function toJournalEvent(r: Record<string, unknown>): PingJournalEvent {
  return {
    event_id: String(r.event_id),
    event_type: String(r.event_type),
    source: (r.source as string) ?? null,
    timestamp: iso(r.timestamp) ?? '',
    payload: (r.payload as Record<string, unknown>) ?? {},
    metadata: (r.metadata as Record<string, unknown>) ?? null,
    namespace: (r.namespace as string) ?? null,
    tenant_id: (r.tenant_id as string) ?? null,
  };
}

function toKnowledgeNode(r: Record<string, unknown>): KnowledgeNodeRow {
  return {
    node_id: String(r.node_id),
    node_type: String(r.node_type),
    label: (r.label as string) ?? null,
    data: (r.data as Record<string, unknown>) ?? null,
    source_event_id: (r.source_event_id as string) ?? null,
    correlation_id: (r.correlation_id as string) ?? null,
    confidence: (r.confidence as number) ?? null,
    created_at: iso(r.created_at),
  };
}

/**
 * Load the canonical state for one INTELLIGENCE_RESEARCH mission. SELECT
 * only. missionId === null loads nothing: the contract's honest empty state
 * (§5) is a pure function that needs no canonical records.
 */
export async function loadMarketingOSCanonicalState(
  missionId: string | null,
): Promise<MarketingOSCanonicalState> {
  if (missionId === null) {
    return { missions: [], events: [], knowledge_nodes: [] };
  }
  if (!MISSION_ID_RE.test(missionId)) {
    throw new Error('invalid_mission_id');
  }
  const [missionRows, linkedRows, eventRows, nodeRows] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT ${MISSION_COLS} FROM ping_missions WHERE mission_id = $1`,
      [missionId],
    ),
    query<Record<string, unknown>>(
      `SELECT ${MISSION_COLS} FROM ping_missions
       WHERE mission_id <> $1 AND payload::text LIKE '%' || $1 || '%'
       ORDER BY created_at`,
      [missionId],
    ),
    query<Record<string, unknown>>(
      `SELECT event_id, event_type, source, timestamp, payload, metadata, namespace, tenant_id
       FROM ping_events
       WHERE payload::text LIKE '%' || $1 || '%'
       ORDER BY timestamp, event_id`,
      [missionId],
    ),
    query<Record<string, unknown>>(
      `SELECT node_id, node_type, label, data, source_event_id, correlation_id, confidence, created_at
       FROM knowledge_nodes
       WHERE correlation_id = $1 OR data::text LIKE '%' || $1 || '%'
       ORDER BY created_at`,
      [missionId],
    ),
  ]);
  return {
    missions: [...missionRows, ...linkedRows].map(toMissionRow),
    events: eventRows.map(toJournalEvent),
    knowledge_nodes: nodeRows.map(toKnowledgeNode),
  };
}

export interface IntelligenceResearchMissionSummary {
  mission_id: string;
  status: string | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** Canonical events referencing this mission (payload linkage). */
  event_count: number;
}

/** Read-only list of INTELLIGENCE_RESEARCH missions (for the MC picker). */
export async function listIntelligenceResearchMissions(): Promise<
  IntelligenceResearchMissionSummary[]
> {
  const rows = await query<Record<string, unknown>>(
    `SELECT m.mission_id, m.status, m.tenant_id, m.created_by, m.created_at,
            m.started_at, m.completed_at,
            (SELECT count(*)::int FROM ping_events e
             WHERE e.payload::text LIKE '%' || m.mission_id || '%') AS event_count
     FROM ping_missions m
     WHERE m.mission_type = 'INTELLIGENCE_RESEARCH'
     ORDER BY m.created_at DESC`,
  );
  return rows.map((r) => ({
    mission_id: String(r.mission_id),
    status: (r.status as string) ?? null,
    tenant_id: (r.tenant_id as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: iso(r.created_at),
    started_at: iso(r.started_at),
    completed_at: iso(r.completed_at),
    event_count: Number(r.event_count ?? 0),
  }));
}
/**
 * Read-only list of ALL ping_missions rows (every mission_type), newest
 * first, with per-mission event linkage. Same payload-linkage LIKE pattern
 * as listIntelligenceResearchMissions; lifecycle_event_count isolates the
 * MISSION_ASSIGNED / MISSION_STARTED events the queue health detector needs.
 */
export async function listPingQueueMissions(): Promise<QueueMissionInput[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT m.mission_id, m.mission_type, m.status, m.tenant_id, m.created_by,
            m.created_at, m.started_at, m.completed_at,
            m.assigned_to, m.retries, m.hold_at,
            m.lease_until, m.claimed_at, m.retry_at, m.hold_reason, m.priority,
            (SELECT count(*)::int FROM ping_events e
             WHERE e.payload::text LIKE '%' || m.mission_id || '%') AS event_count,
            (SELECT count(*)::int FROM ping_events e2
             WHERE e2.payload::text LIKE '%' || m.mission_id || '%'
               AND e2.event_type IN ('MISSION_ASSIGNED', 'MISSION_STARTED')) AS lifecycle_event_count
     FROM ping_missions m
     ORDER BY m.created_at DESC`,
  );
  return rows.map((r) => ({
    mission_id: String(r.mission_id),
    mission_type: (r.mission_type as string) ?? null,
    status: (r.status as string) ?? null,
    tenant_id: (r.tenant_id as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: iso(r.created_at),
    started_at: iso(r.started_at),
    completed_at: iso(r.completed_at),
    assigned_to: (r.assigned_to as string) ?? null,
    retries: (r.retries as number) ?? null,
    hold_at: iso(r.hold_at),
    lease_until: iso(r.lease_until),
    claimed_at: iso(r.claimed_at),
    retry_at: iso(r.retry_at),
    hold_reason: (r.hold_reason as string) ?? null,
    priority: (r.priority as number) ?? null,
    event_count: Number(r.event_count ?? 0),
    lifecycle_event_count: Number(r.lifecycle_event_count ?? 0),
  }));
}
