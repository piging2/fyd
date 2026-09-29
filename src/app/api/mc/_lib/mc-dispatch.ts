/**
 * Lane D shared server library: Mission Control dispatch over the EXISTING
 * event plane. No new store, no new authority.
 *
 * - Journal: the existing append-only PING journal JSONL
 *   (/home/nolan/workspace/fyd-journal-gateway/events.jsonl). MC_DISPATCH_*
 *   event types ride the journal's stream model (same envelope as emit.py),
 *   so existing readers are unaffected.
 * - Authorization / work orders / result verification: the EXISTING
 *   ExternalAgentAdapter, called through the lane-d shim
 *   (/home/nolan/workspace/mission-control/lane-d/adapter-call.js).
 *   This library never re-implements the adapter's decisions.
 * - Projection: deterministic, journal -> mission records. Same event
 *   history -> same state (replay-safe). UNKNOWN is first-class: timeouts
 *   and unverifiable results NEVER render as FAILED.
 */

import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

export const JOURNAL_PATH = '/home/nolan/workspace/fyd-journal-gateway/events.jsonl';
export const ARTIFACT_ROOT = '/home/nolan/workspace/mission-control/artifacts';
export const ADAPTER_SHIM = '/home/nolan/workspace/mission-control/lane-d/adapter-call.js';

// Agents this slice may dispatch to. Defense-in-depth mirror only: the
// adapter is consulted for real on every dispatch and its verdict is final.
// identity_5..10 are DENIED here and by Nolan's standing containment rule.
export const SLICE_AGENTS = ['ollama', 'identity_1', 'identity_2', 'identity_3', 'identity_4'] as const;
export type SliceAgent = (typeof SLICE_AGENTS)[number];

export const SLICE_TENANTS = ['happy-place', 'coppersmith-plumbing'] as const;

export const PROMPT_MAX = 2000;

// Bounded execution deadlines (seconds). Deadline expiry -> MC_RUN_UNKNOWN,
// never FAILED (timeouts never render as FAILED).
export const DEADLINES: Record<SliceAgent, number> = {
  ollama: 180,
  identity_1: 600,
  identity_2: 600,
  identity_3: 600,
  identity_4: 600,
};

export const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
export const OLLAMA_MODEL = 'qwen2.5-coder:1.5b';
export const BROKER_DISPATCH = '/home/nolan/copilot-broker/dispatch-task.js';
export const BROKER_STATE = '/home/nolan/copilot-broker/state/identities.json';

export const NAMESPACE_RE = /^(core|tenant)::[a-z0-9_.-]+$/;

// Fixed dispatcher constraints for this slice. The contract hard-requires
// no_canonical_events and no_mission_state_writes; the profiles tighten
// read_only / no_writes / no_network. The AGENT never emits events: PING
// (this route) is the only event emitter.
export const FIXED_CONSTRAINTS = {
  read_only: true,
  no_writes: true,
  no_network: true,
  no_canonical_events: true,
  no_mission_state_writes: true,
} as const;

export type MissionStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'DENIED';

export interface AgentProfile {
  status: string;
  family: string;
  allowedCapabilities: string[];
  maxConstraints: Record<string, boolean>;
  invocation: string;
}

export interface JournalEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  aggregate_id: string;
  aggregate_type: string;
  event_data: Record<string, unknown>;
}

export interface MissionArtifact {
  kind: string;
  path: string;
  sha256: string | null;
  event_id: string;
  /**
   * Truthfulness (2026-09-27): whether the artifact file exists on disk at
   * projection time. The journal may claim path+sha256 for content that was
   * deleted or never persisted; present=false marks the claim unverifiable.
   * Never treat sha256 as evidence when present is false.
   */
  present: boolean;
}

export interface MissionRecord {
  mission_id: string;
  run_id: string | null;
  execution_id: string | null;
  status: MissionStatus;
  status_event_id: string | null;
  agent: string | null;
  tenant: string | null;
  capability: string | null;
  capabilities_granted: string[];
  work_order_id: string | null;
  context_pack_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  result: {
    outcome: string | null;
    output_digest: string | null;
    output_chars: number | null;
    error: string | null;
  };
  reconciliation_state: string | null;
  artifacts: MissionArtifact[];
  evidence: Array<Record<string, unknown>>;
  events: Array<{
    event_id: string;
    event_type: string;
    timestamp: string;
    summary: string | null;
  }>;
}

const DISPATCH_EVENT_TYPES = new Set([
  'MC_MISSION_CREATED',
  'MC_RUN_QUEUED',
  'MC_EXECUTION_STARTED',
  'MC_AGENT_AUTHORIZED',
  'MC_AGENT_DENIED',
  'MC_ARTIFACT_PUBLISHED',
  'MC_RUN_SUCCEEDED',
  'MC_RUN_FAILED',
  'MC_RUN_UNKNOWN',
]);

/**
 * P0 front-door idempotency (2026-09-27): client-supplied idempotency key.
 * Format mirrors the Python front door's fail-closed key validation
 * (mission_intent.py `_RE_IDEMPOTENCY_KEY`); TS slice uses [A-Za-z0-9._-].
 * When the caller supplies no key, IDEMPOTENCY_KEY_DEFAULT keeps the
 * derived missionId deterministic so byte-identical retries collide.
 */
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._-]{1,128}$/;
export const IDEMPOTENCY_KEY_DEFAULT = 'default';

/**
 * Terminal mission statuses for idempotency lookup. A duplicate POST that
 * lands on one of these returns the original record with
 * duplicate_suppressed:true and emits ZERO new events. UNKNOWN is NOT
 * terminal here: it means reconciliation is in progress, so a duplicate
 * POST on an UNKNOWN mission returns 409 HOLD and never re-dispatches.
 */
export const MISSION_TERMINAL_STATUSES: Set<MissionStatus> = new Set([
  'SUCCEEDED',
  'FAILED',
  'DENIED',
]);

export function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Deterministic, content-derived event id. Idempotent: emit skips existing ids. */
export function mintEventId(kind: string, missionId: string, eventType: string, summary: string): string {
  return 'mc-d-' + sha256hex([kind, missionId, eventType, summary].join('|')).slice(0, 12);
}

export function loadJournalEvents(): JournalEvent[] {
  if (!existsSync(JOURNAL_PATH)) return [];
  const events: JournalEvent[] = [];
  const seen = new Set<string>();
  for (const line of readFileSync(JOURNAL_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as JournalEvent;
      if (!ev.event_id || seen.has(ev.event_id)) continue;
      seen.add(ev.event_id);
      events.push(ev);
    } catch {
      // Malformed line: skip, never fabricate.
    }
  }
  // Deterministic order: acceptance time, then id.
  events.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1
    : a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0,
  );
  return events;
}

function journalHas(eventId: string): boolean {
  if (!existsSync(JOURNAL_PATH)) return false;
  const data = readFileSync(JOURNAL_PATH, 'utf8');
  return data.includes(`"event_id":"${eventId}"`);
}

/**
 * Lane D ordering fix (2026-09-26): the projector orders by
 * (timestamp, event_id), so two events for one mission sharing a timestamp
 * can apply out of causal order (proven by synthetic probe
 * mc-m-test-unknown-01: MC_RUN_UNKNOWN sorted before MC_MISSION_CREATED on
 * equal timestamps and the mission rendered CREATED). The emitter therefore
 * guarantees strictly increasing acceptance timestamps per mission: if now
 * is not after this mission's last event, the timestamp is bumped +1ms.
 * Timestamps remain acceptance times; only the tie is broken.
 */
function maxMissionTimestamp(missionId: string): string | null {
  if (!existsSync(JOURNAL_PATH)) return null;
  const agg = `mc:mission:${missionId}`;
  let max: string | null = null;
  for (const line of readFileSync(JOURNAL_PATH, 'utf8').split('\n')) {
    if (!line.includes(agg)) continue;
    try {
      const ev = JSON.parse(line) as JournalEvent;
      if (ev.aggregate_id === agg && typeof ev.timestamp === 'string') {
        if (max === null || ev.timestamp > max) max = ev.timestamp;
      }
    } catch {
      // Malformed line: skip, never fabricate.
    }
  }
  return max;
}

export function appendDispatchEvent(
  eventType: string,
  missionId: string,
  summary: string,
  data: Record<string, unknown>,
): { event: JournalEvent; disposition: 'appended' | 'duplicate-skipped' } {
  let ts = nowIso();
  const prev = maxMissionTimestamp(missionId);
  if (prev !== null && ts <= prev) {
    ts = new Date(Date.parse(prev) + 1).toISOString();
  }
  const eventId = mintEventId('dispatch', missionId, eventType, summary);
  const event: JournalEvent = {
    event_id: eventId,
    timestamp: ts,
    event_type: eventType,
    aggregate_id: `mc:mission:${missionId}`,
    aggregate_type: 'mc_mission',
    event_data: {
      mission_id: missionId,
      backfill: false,
      source_timestamp: ts,
      observation_timestamp: ts,
      import_timestamp: ts,
      summary,
      ...data,
    },
  };
  if (journalHas(eventId)) return { event, disposition: 'duplicate-skipped' };
  mkdirSync(join(ARTIFACT_ROOT, '..'), { recursive: true });
  appendFileSync(JOURNAL_PATH, JSON.stringify(event) + '\n', 'utf8');
  return { event, disposition: 'appended' };
}

/** Call the existing adapter authority through the lane-d shim. Never re-implements it. */
export function adapterCall(op: 'profiles' | 'authorize' | 'issue' | 'verify', payload?: unknown): unknown {
  const args = [ADAPTER_SHIM, op];
  if (payload !== undefined) args.push(JSON.stringify(payload));
  const r = spawnSync('node', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw new Error(`adapter_shim_spawn_failed: ${String(r.error)}`);
  if (r.status !== 0) {
    throw new Error(`adapter_shim_exit_${r.status}: ${(r.stdout || '') + (r.stderr || '')}`.slice(0, 500));
  }
  return JSON.parse(r.stdout);
}

export function loadProfiles(): Record<string, AgentProfile> {
  const r = adapterCall('profiles') as { ok: boolean; profiles?: Record<string, AgentProfile>; error?: string };
  if (!r || r.ok !== true || !r.profiles) throw new Error(`adapter_profiles_failed: ${r?.error || 'no profiles'}`);
  return r.profiles;
}

/** Deterministic mission projection: journal -> mission records. Replay-safe. */
export function projectMissions(events: JournalEvent[]): MissionRecord[] {
  const byId = new Map<string, MissionRecord>();
  const get = (missionId: string): MissionRecord => {
    let m = byId.get(missionId);
    if (!m) {
      m = {
        mission_id: missionId,
        run_id: null,
        execution_id: null,
        status: 'CREATED',
        status_event_id: null,
        agent: null,
        tenant: null,
        capability: null,
        capabilities_granted: [],
        work_order_id: null,
        context_pack_id: null,
        started_at: null,
        ended_at: null,
        result: { outcome: null, output_digest: null, output_chars: null, error: null },
        reconciliation_state: null,
        artifacts: [],
        evidence: [],
        events: [],
      };
      byId.set(missionId, m);
    }
    return m;
  };

  for (const ev of events) {
    if (!DISPATCH_EVENT_TYPES.has(ev.event_type)) continue;
    const d = ev.event_data || {};
    const missionId = d.mission_id as string | undefined;
    if (!missionId || typeof missionId !== 'string') continue;
    const m = get(missionId);
    const summary = (d.summary as string) ?? null;
    m.events.push({ event_id: ev.event_id, event_type: ev.event_type, timestamp: ev.timestamp, summary });

    switch (ev.event_type) {
      case 'MC_MISSION_CREATED':
        m.status = 'CREATED';
        m.status_event_id = ev.event_id;
        m.agent = (d.agent as string) ?? null;
        m.tenant = (d.tenant as string) ?? null;
        m.capability = (d.capability as string) ?? null;
        m.context_pack_id = (d.context_pack_id as string) ?? null;
        m.started_at = (d.source_timestamp as string) ?? ev.timestamp;
        break;
      case 'MC_RUN_QUEUED':
        m.status = 'QUEUED';
        m.status_event_id = ev.event_id;
        m.run_id = (d.run_id as string) ?? m.run_id;
        break;
      case 'MC_EXECUTION_STARTED':
        m.status = 'RUNNING';
        m.status_event_id = ev.event_id;
        m.execution_id = (d.execution_id as string) ?? m.execution_id;
        break;
      case 'MC_AGENT_AUTHORIZED':
        m.capabilities_granted = (d.capabilities_granted as string[]) ?? [];
        m.work_order_id = (d.work_order_id as string) ?? null;
        break;
      case 'MC_AGENT_DENIED':
        // Terminal-informative: an authorization decision, never a failure.
        m.status = 'DENIED';
        m.status_event_id = ev.event_id;
        m.ended_at = ev.timestamp;
        m.result.error = (d.reason as string) ?? 'denied';
        break;
      case 'MC_ARTIFACT_PUBLISHED': {
        // Truthfulness (2026-09-27): verify the file exists before reporting
        // it as evidence. Journal claims outlive deleted content; present=false
        // reports the claim as missing instead of manufacturing certainty.
        const artifactPath = (d.path as string) ?? '';
        m.artifacts.push({
          kind: (d.kind as string) ?? 'artifact',
          path: artifactPath,
          sha256: (d.sha256 as string) ?? null,
          event_id: ev.event_id,
          present: artifactPath !== '' && existsSync(artifactPath),
        });
        break;
      }
      case 'MC_RUN_SUCCEEDED':
        m.status = 'SUCCEEDED';
        m.status_event_id = ev.event_id;
        m.ended_at = ev.timestamp;
        m.result.outcome = 'completed';
        m.result.output_digest = (d.output_digest as string) ?? null;
        m.result.output_chars = (d.output_chars as number) ?? null;
        m.reconciliation_state = null;
        break;
      case 'MC_RUN_FAILED':
        m.status = 'FAILED';
        m.status_event_id = ev.event_id;
        m.ended_at = ev.timestamp;
        m.result.outcome = 'failed';
        m.result.error = (d.error as string) ?? null;
        m.reconciliation_state = null;
        break;
      case 'MC_RUN_UNKNOWN':
        // FIRST-CLASS: outcome unknown. Never collapsed into FAILED.
        m.status = 'UNKNOWN';
        m.status_event_id = ev.event_id;
        m.ended_at = ev.timestamp;
        m.result.outcome = 'unknown';
        m.result.error = (d.reason as string) ?? null;
        m.reconciliation_state = (d.reconciliation_state as string) ?? 'RECONCILIATION IN PROGRESS';
        break;
    }

    const evd = d.evidence;
    if (evd && typeof evd === 'object') {
      m.evidence.push({ ...(evd as Record<string, unknown>), event_id: ev.event_id, event_type: ev.event_type });
    }
  }

  return [...byId.values()].sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
}

/**
 * P0 front-door idempotency (2026-09-27): lookup-before-mint.
 *
 * Projects only the aggregate `mc:mission:<missionId>` and returns its
 * record, or null when the journal holds nothing for this mission id.
 * The caller decides terminal vs in-flight via MISSION_TERMINAL_STATUSES.
 * Read-only: never appends, never mints.
 */
export function findPriorMission(missionId: string): MissionRecord | null {
  const agg = `mc:mission:${missionId}`;
  const relevant = loadJournalEvents().filter(
    (e) => e.aggregate_id === agg && DISPATCH_EVENT_TYPES.has(e.event_type),
  );
  if (relevant.length === 0) return null;
  const projected = projectMissions(relevant);
  return projected.find((m) => m.mission_id === missionId) ?? null;
}

export function writeArtifact(missionId: string, name: string, content: string): { path: string; sha256: string } {
  const dir = join(ARTIFACT_ROOT, missionId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return { path, sha256: sha256hex(content) };
}

export function publishArtifact(
  missionId: string,
  kind: string,
  name: string,
  content: string,
  tenant: string,
): { path: string; sha256: string } {
  const { path, sha256 } = writeArtifact(missionId, name, content);
  appendDispatchEvent('MC_ARTIFACT_PUBLISHED', missionId, `${kind} published: ${name}`, {
    kind,
    path,
    sha256,
    tenant,
  });
  return { path, sha256 };
}
