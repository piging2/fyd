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

/**
 * Nolan's four latency/failure layers (2026-10-02 execution-optimization
 * doctrine) as an observability category. single_turn and cross_call are
 * not visible at mission granularity and are never assigned from mission
 * data: a mission row can only honestly claim cross_workflow, cross_machine,
 * none, or unknown.
 */
export type DelayLayerKind =
  | 'cross_workflow'
  | 'cross_machine'
  | 'none'
  | 'unknown';

export interface DelayLayer {
  layer: DelayLayerKind;
  /** Always true: the layer is derived from row signals, never stored. */
  derived: true;
  reason: string;
}

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
  /** Durable-execution lens: lease / routing / checkpoint state, verbatim. */
  lease_until: string | null;
  claimed_at: string | null;
  retry_at: string | null;
  hold_reason: string | null;
  priority: number | null;
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
  /** Durable-execution lens, verbatim from the row. */
  lease_until: string | null;
  claimed_at: string | null;
  retry_at: string | null;
  hold_reason: string | null;
  priority: number | null;
  health: MissionHealth;
  /** Which latency/failure layer a delay or failure sits in (derived). */
  delay_layer: DelayLayer;
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
    lease_until: m.lease_until,
    claimed_at: m.claimed_at,
    retry_at: m.retry_at,
    hold_reason: m.hold_reason,
    priority: m.priority,
    health: missionHealth(m),
    delay_layer: delayLayer(m),
  };
}

/**
 * Derive which latency/failure layer a mission's delay or failure sits in.
 * Pure: pass nowMs in tests. Rules, in order:
 *   TERMINAL status            -> none (no delay to attribute)
 *   ON_HOLD (hold_at set)      -> cross_workflow (durable checkpoint/hold)
 *   STALLED (no consumer)      -> cross_machine (worker routing / consumer
 *                                 absence: nobody picked the work up)
 *   retries > 0 / retry_pending-> cross_workflow (durable retry loop)
 *   lease_until in the future  -> cross_machine (lease held, worker silent)
 *   otherwise                  -> unknown (insufficient evidence; never
 *                                 guessed from thin signals)
 */
export function delayLayer(
  m: QueueMissionInput,
  nowMs: number = Date.now(),
): DelayLayer {
  const D = (layer: DelayLayerKind, reason: string): DelayLayer => ({
    layer,
    derived: true,
    reason,
  });
  const statusNorm = (m.status ?? '').trim().toLowerCase();
  if (TERMINAL_STATUSES.has(statusNorm)) {
    return D('none', `status '${m.status}' is terminal: no delay to attribute`);
  }
  if (m.hold_at !== null) {
    return D(
      'cross_workflow',
      'mission is held: durable checkpoint/hold, layer 3 (cross-workflow)',
    );
  }
  const health = missionHealth(m, nowMs);
  if (health.state === 'STALLED') {
    return D(
      'cross_machine',
      'stalled with no consumer: worker routing / consumer absence, layer 4 (cross-machine)',
    );
  }
  if ((m.retries ?? 0) > 0 || statusNorm === 'retry_pending') {
    return D(
      'cross_workflow',
      'mission is in a retry loop: durable execution retry, layer 3 (cross-workflow)',
    );
  }
  const leaseMs =
    m.lease_until === null ? Number.NaN : Date.parse(m.lease_until);
  if (!Number.isNaN(leaseMs) && leaseMs > nowMs) {
    return D(
      'cross_machine',
      'lease held by a worker with no observed progress: layer 4 (cross-machine)',
    );
  }
  return D(
    'unknown',
    'insufficient evidence to attribute this mission to a latency layer',
  );
}

/** Project a full queue list. Empty in -> empty out (honest empty). */
export function projectQueueMissions(
  missions: QueueMissionInput[],
): ProjectedQueueMission[] {
  return missions.map(projectQueueMission);
}
