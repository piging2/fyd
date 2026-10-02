/**
 * MC queue projection: pure mapping + health derivation for GET /api/mc/queue.
 *
 * PROJECTION ONLY. This module never touches the database, never caches,
 * and never authorizes anything: it maps rows read by the read-only adapter
 * (mc-ping-journal.ts) into Mission Control's truthful vocabulary.
 *
 * Nolan's canonical state vocabulary (per the 2026-10-02 alignment record):
 *   OBSERVED / DERIVED / INFERRED / PROPOSED / APPROVED / EXECUTED /
 *   VERIFIED / FAILED / UNKNOWN.
 *
 * EXPLICIT MAPPING TABLE (postgres ping_missions.status -> canonical state):
 *   created       -> PROPOSED   (declared, not yet running)
 *   assigned      -> EXECUTED   (in execution: handed to a worker)
 *   running       -> EXECUTED   (in execution)
 *   retry_pending -> EXECUTED   (in execution: queued for another attempt)
 *   completed     -> EXECUTED   (ran to completion; success/failure of the
 *                                underlying work is in the result column,
 *                                not the mission lifecycle)
 *   failed        -> FAILED     (the mission itself failed)
 *   archived      -> EXECUTED   (lifecycle done, kept for record)
 *   null / anything else -> UNKNOWN (unmappable MUST be UNKNOWN, never guessed)
 *
 * The mapping is case-insensitive and whitespace-tolerant, but unknown
 * strings are never coerced into a guess: UNKNOWN is a legitimate state.
 *
 * HEALTH is a DERIVED field (every response carries derived:true). States:
 *   ON_HOLD    - hold_at IS NOT NULL (an explicit hold on the row)
 *   TERMINAL   - status in (completed, failed, archived)
 *   STALLED    - non-terminal status AND no MISSION_ASSIGNED/MISSION_STARTED
 *                event exists for the mission AND created_at is over 1h old.
 *                This is the "stuck mission with no consumer" detector.
 *   HEALTHY    - everything else (non-terminal with observed lifecycle events,
 *                or insufficient evidence to call it STALLED)
 *
 * STALLED is never inferred from thin evidence: a missing created_at or a
 * present lifecycle event keeps the mission HEALTHY rather than STALLED.
 */

export type CanonicalState =
  | 'OBSERVED'
  | 'DERIVED'
  | 'INFERRED'
  | 'PROPOSED'
  | 'APPROVED'
  | 'EXECUTED'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNKNOWN';

export type MissionHealthState = 'STALLED' | 'ON_HOLD' | 'TERMINAL' | 'HEALTHY';

export interface QueueMissionInput {
  mission_id: string;
  mission_type: string | null;
  status: string | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  retries: number | null;
  hold_at: string | null;
  /** Events whose payload references this mission (payload linkage). */
  event_count: number;
  /** Of those, the ones proving a consumer picked it up. */
  lifecycle_event_count: number;
}

export interface MissionHealth {
  state: MissionHealthState;
  /** Always true: health is computed, never stored on the row. */
  derived: true;
  reason: string;
}

export interface ProjectedQueueMission {
  mission_id: string;
  mission_type: string | null;
  /** Raw postgres status, verbatim: the projection shows, never rewrites. */
  status: string | null;
  /** Nolan's canonical vocabulary, via the EXPLICIT table above. */
  canonical_state: CanonicalState;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  retries: number | null;
  event_count: number;
  health: MissionHealth;
}

const STATUS_TO_CANONICAL: Record<string, CanonicalState> = {
  created: 'PROPOSED',
  assigned: 'EXECUTED',
  running: 'EXECUTED',
  retry_pending: 'EXECUTED',
  completed: 'EXECUTED',
  failed: 'FAILED',
  archived: 'EXECUTED',
};

/** Map a raw postgres status to Nolan's canonical vocabulary. */
export function canonicalState(status: string | null): CanonicalState {
  if (status === null) return 'UNKNOWN';
  const mapped = STATUS_TO_CANONICAL[status.trim().toLowerCase()];
  return mapped ?? 'UNKNOWN';
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'archived']);

const STALLED_AGE_MS = 60 * 60 * 1000; // 1h

/** Derive the health of one mission row. Pure: pass nowMs in tests. */
export function missionHealth(
  m: QueueMissionInput,
  nowMs: number = Date.now(),
): MissionHealth {
  if (m.hold_at !== null) {
    return {
      state: 'ON_HOLD',
      derived: true,
      reason: 'hold_at is set on the mission row',
    };
  }
  const statusNorm = (m.status ?? '').trim().toLowerCase();
  if (TERMINAL_STATUSES.has(statusNorm)) {
    return {
      state: 'TERMINAL',
      derived: true,
      reason: `status '${m.status}' is terminal`,
    };
  }
  const createdMs =
    m.created_at === null ? Number.NaN : Date.parse(m.created_at);
  const oldEnough =
    !Number.isNaN(createdMs) && nowMs - createdMs > STALLED_AGE_MS;
  if (m.lifecycle_event_count === 0 && oldEnough) {
    return {
      state: 'STALLED',
      derived: true,
      reason:
        'non-terminal status with no MISSION_ASSIGNED/MISSION_STARTED event and created_at over 1h ago',
    };
  }
  return {
    state: 'HEALTHY',
    derived: true,
    reason:
      m.lifecycle_event_count > 0
        ? 'non-terminal mission with observed lifecycle events'
        : 'non-terminal mission with insufficient evidence to call it STALLED',
  };
}

/** Project one mission row into the MC queue shape. */
export function projectQueueMission(m: QueueMissionInput): ProjectedQueueMission {
  return {
    mission_id: m.mission_id,
    mission_type: m.mission_type,
    status: m.status,
    canonical_state: canonicalState(m.status),
    tenant_id: m.tenant_id,
    created_by: m.created_by,
    created_at: m.created_at,
    started_at: m.started_at,
    completed_at: m.completed_at,
    assigned_to: m.assigned_to,
    retries: m.retries,
    event_count: m.event_count,
    health: missionHealth(m),
  };
}

/** Project a full queue list. Empty in -> empty out (honest empty). */
export function projectQueueMissions(
  missions: QueueMissionInput[],
): ProjectedQueueMission[] {
  return missions.map(projectQueueMission);
}
