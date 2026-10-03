/**
 * MC lineage spine builders — the ONE operational spine as pure functions.
 *
 * A read-only projection over EXISTING truth. No new store, no new
 * authority. Every section carries an explicit source label:
 *   LIVE      — read directly from a live source (journal rows)
 *   PROJECTED — assembled by the lineage surface from live sources
 *   DERIVED   — computed from live data
 *   MOCK      — quarantined mock data (never emitted on the real path;
 *               the label exists so any future mock is visible, not silent)
 *   UNKNOWN   — rendered as UNKNOWN with a reason, never guessed
 *
 * Truth-state mapping to the queue projection's vocabulary:
 * LIVE == OBSERVED. The spine is: MISSION -> RUN -> EXECUTION -> AGENT
 * -> RESULT -> EVIDENCE -> EVENT.
 */

import type { MissionRecord } from './mc-dispatch';

export type SpineSource = 'LIVE' | 'PROJECTED' | 'DERIVED' | 'MOCK' | 'UNKNOWN';

export interface SpineStage {
  stage: string;
  source: SpineSource;
  note: string;
  data: unknown;
}

export function stage(
  stage: string,
  source: SpineSource,
  note: string,
  data: unknown,
): SpineStage {
  return { stage, source, note, data };
}

/**
 * Build the mission spine from a projected MissionRecord.
 * Pure: same record in -> same spine out.
 */
export function missionSpine(m: MissionRecord): SpineStage[] {
  const created = m.events.find((e) => e.event_type === 'MC_MISSION_CREATED');
  const queued = m.events.find((e) => e.event_type === 'MC_RUN_QUEUED');
  const authorized = m.events.find((e) => e.event_type === 'MC_AGENT_AUTHORIZED');
  const denied = m.events.find((e) => e.event_type === 'MC_AGENT_DENIED');
  const terminal = m.events.find((e) =>
    ['MC_RUN_SUCCEEDED', 'MC_RUN_FAILED', 'MC_RUN_UNKNOWN'].includes(e.event_type),
  );
  const published = m.events.filter((e) => e.event_type === 'MC_ARTIFACT_PUBLISHED');

  return [
    stage('MISSION', 'LIVE', 'journal row MC_MISSION_CREATED; the mission identity', {
      mission_id: m.mission_id,
      tenant: m.tenant,
      capability: m.capability,
      work_order_id: m.work_order_id,
      context_pack_id: m.context_pack_id,
      created_at: m.started_at,
      event_id: created?.event_id ?? null,
    }),
    stage('RUN', 'LIVE', 'journal row MC_RUN_QUEUED; the durable run record', {
      run_id: m.run_id,
      status: m.status,
      status_event_id: m.status_event_id,
      queued_at: queued?.timestamp ?? null,
      reconciliation_state: m.reconciliation_state,
    }),
    stage('EXECUTION', 'LIVE', 'journal rows MC_EXECUTION_STARTED and MC_AGENT_AUTHORIZED/DENIED', {
      execution_id: m.execution_id,
      agent: m.agent,
      capabilities_granted: m.capabilities_granted,
      authorized_at: authorized?.timestamp ?? null,
      authorization_event_id: authorized?.event_id ?? denied?.event_id ?? null,
      authorized: !!authorized && !denied,
    }),
    stage(
      'AGENT',
      'PROJECTED',
      'agent identity as recorded at dispatch; the agent never owns truth: mission context + allowed capabilities + objects/evidence in, result and/or proposed transition out, existing authority decides canonical',
      {
        agent: m.agent,
        tenant: m.tenant,
        capabilities_granted: m.capabilities_granted,
      },
    ),
    stage(
      'RESULT',
      'LIVE',
      'terminal journal row and published artifacts; present=false means the artifact claim is unverifiable, never treated as evidence',
      {
        outcome: m.result.outcome,
        output_digest: m.result.output_digest,
        output_chars: m.result.output_chars,
        error: m.result.error,
        ended_at: m.ended_at,
        terminal_event: terminal
          ? {
              event_id: terminal.event_id,
              event_type: terminal.event_type,
              timestamp: terminal.timestamp,
            }
          : null,
        artifacts: m.artifacts.map((a) => ({
          kind: a.kind,
          path: a.path,
          sha256: a.sha256,
          present: a.present,
          event_id: a.event_id,
        })),
        artifacts_published: published.length,
      },
    ),
    stage('EVIDENCE', 'LIVE', 'evidence list recorded on the mission; provenance refs, never secrets', {
      count: m.evidence.length,
      items: m.evidence,
    }),
    stage(
      'EVENT',
      'LIVE',
      'complete journal event trail for this mission; replay reconstructs this projection deterministically',
      {
        count: m.events.length,
        events: m.events,
      },
    ),
  ];
}

/** The canonical spine stage order. Used by tests to pin the contract. */
export const SPINE_ORDER = [
  'MISSION',
  'RUN',
  'EXECUTION',
  'AGENT',
  'RESULT',
  'EVIDENCE',
  'EVENT',
] as const;
