/**
 * projectMarketingOS — deterministic read-only projection of an
 * INTELLIGENCE_RESEARCH mission into the MarketingOS projection shape.
 *
 * Contract: ~/workspace/goals/ping-agent-execution-stack/files/MARKETINGOS-PROJECTION-CONTRACT.md
 * (v1, PROVISIONAL). Pure function of (objective, mission_id, canonical_state,
 * as_of): no wall-clock reads, no I/O, no invention. Same inputs ->
 * byte-identical output (canonical JSON: sorted keys, id-sorted arrays).
 *
 * Landed vocabulary only (2026-09-30 forensics landings):
 * - mission labels: INTELLIGENCE_RESEARCH / EXPERIMENT_RUN / DISTRIBUTION_RUN
 * - verdicts: CONFIRMED / REFUTED / UNCLEAR (landed @ ae4b6843f)
 * - approval events: PROPOSED_ACTION / ACTION_APPROVED / REJECTED
 *   (landed @ 217294506; note: the contract draft says ACTION_REJECTED, the
 *   landed type is REJECTED — the projection uses the LANDED vocabulary)
 * - approval payloads (landed shape): PROPOSED_ACTION carries action_id,
 *   capability, target_identity, preview, reason, evidence_refs, risk,
 *   proposed_by, expires_at; ACTION_APPROVED/REJECTED carry action_id,
 *   decision, decided_by, reason; decision time is the event row timestamp.
 *   The contract draft's principal / artifact-digest / approval-time bindings
 *   are NOT projected (they do not exist in the landed rows).
 * - evidence: projected only as the landed CLAIM_CREATED claim.evidence
 *   shape; kernel Evidence fields (evidence_type, artifact_id, verify) are
 *   absent from landed rows and are never fabricated.
 *
 * Law: PROJECT, DON'T INVENT. Every KNOWN field cites its canonical source.
 * Anything unreachable from landed rows renders as an explicit epistemic
 * state with a machine-readable reason, never as fabricated content.
 */

import type {
  MarketingOSCanonicalState,
  PingJournalEvent,
  PingMissionRow,
} from './mc-ping-journal';

export type EpistemicState =
  | 'KNOWN'
  | 'UNKNOWN'
  | 'NOT_STARTED'
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'CONFLICTING';

export interface FieldState {
  state: EpistemicState;
  reason?: string;
  data?: unknown;
  note?: string;
}

export interface MarketingOSProjection {
  objective: { state: 'KNOWN'; source: 'operator'; text: string };
  mission: FieldState;
  research: {
    sources: FieldState;
    observations: FieldState;
    claims: FieldState;
    evidence: FieldState;
    contradictions: FieldState;
    unknowns: FieldState;
  };
  audience: FieldState;
  opportunity: FieldState;
  artifact: FieldState;
  approval: FieldState;
  distribution: FieldState;
  effect: FieldState;
  outcome: FieldState;
  learning: FieldState;
  next_question: FieldState;
  deployment: FieldState;
  /**
   * Contract Law 4: the canonical projector understands PROJECT/PLAN/VERIFY,
   * the driver emits OBJECT_GRAPH/SITE_SPEC. Until a semantic mapping is
   * proven and owned, stages render 3/7 with UNKNOWN + STAGE_VOCABULARY_UNMAPPED.
   * Present only when a mission is supplied: the §5 honest empty state must
   * equal the contract shape exactly, so the empty state carries no stages.
   */
  stages?: {
    state: 'UNKNOWN';
    reason: 'STAGE_VOCABULARY_UNMAPPED';
    summary: '3/7 UNKNOWN';
    projector_stages: string[];
    driver_stages: string[];
    note: string;
  };
}

/** Canonical JSON: sorted keys, arrays of records sorted by their id field. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    if (
      items.length > 0 &&
      items.every(
        (i) => typeof i === 'object' && i !== null && !Array.isArray(i),
      )
    ) {
      const idKey = ['event_id', 'claim_id', 'node_id', 'mission_id', 'action_id'].find(
        (k) => (items[0] as Record<string, unknown>)[k] !== undefined,
      );
      if (idKey) {
        items.sort((a, b) =>
          String((a as Record<string, unknown>)[idKey]).localeCompare(
            String((b as Record<string, unknown>)[idKey]),
          ),
        );
      }
    }
    return items;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/**
 * The honest empty state (contract §5, normative). mission_id null ->
 * this shape exactly. No canonical records are consulted.
 */
export function emptyMarketingOSProjection(
  objectiveText: string,
): MarketingOSProjection {
  return {
    objective: { state: 'KNOWN', source: 'operator', text: objectiveText },
    mission: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
    research: {
      sources: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
      observations: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
      claims: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
      evidence: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
      contradictions: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
      unknowns: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
    },
    audience: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
    opportunity: { state: 'UNKNOWN', reason: 'NO_VERIFIED_DEMAND_OBSERVATIONS' },
    artifact: { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' },
    approval: { state: 'NOT_STARTED', reason: 'APPROVAL_NOT_REQUESTED' },
    distribution: { state: 'NOT_STARTED', reason: 'ARTIFACT_NOT_APPROVED' },
    effect: { state: 'NOT_STARTED', reason: 'DISTRIBUTION_NOT_ATTEMPTED' },
    outcome: { state: 'NOT_STARTED', reason: 'DISTRIBUTION_NOT_ATTEMPTED' },
    learning: { state: 'NOT_STARTED', reason: 'LEARNING_NOT_RECORDED' },
    next_question: { state: 'NOT_STARTED', reason: 'LEARNING_NOT_RECORDED' },
    deployment: { state: 'UNKNOWN', reason: 'SOURCE_TO_SERVED_CHAIN_NOT_CERTIFIED' },
  };
}

const VERDICTS = new Set(['CONFIRMED', 'REFUTED', 'UNCLEAR']);

const LIFECYCLE_TYPES = new Set([
  'MISSION_CREATED',
  'MISSION_ASSIGNED',
  'MISSION_STARTED',
  'MISSION_COMPLETED',
  'MISSION_FAILED',
  'MISSION_CANCELLED',
]);

const APPROVAL_TYPES = new Set([
  'PROPOSED_ACTION',
  'ACTION_APPROVED',
  'REJECTED', // landed vocabulary (@ 217294506); the draft's ACTION_REJECTED does not exist
]);

function payloadStr(ev: PingJournalEvent, key: string): string | null {
  const v = ev.payload[key];
  return typeof v === 'string' ? v : null;
}

function payloadObj(ev: PingJournalEvent, key: string): Record<string, unknown> | null {
  const v = ev.payload[key];
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * projectMarketingOS(objective, mission_id, canonical_state, as_of).
 * mission_id null -> the §5 honest empty state, exactly.
 */
export function projectMarketingOS(
  objectiveText: string,
  missionId: string | null,
  canonicalState: MarketingOSCanonicalState,
  asOf: string,
): MarketingOSProjection {
  if (missionId === null) return emptyMarketingOSProjection(objectiveText);

  // as_of bounds the event horizon (same discipline as project(events, as_of)).
  const events = canonicalState.events.filter((e) => e.timestamp <= asOf);
  const missions = canonicalState.missions.filter(
    (m) => (m.created_at ?? '') <= asOf,
  );
  const nodes = canonicalState.knowledge_nodes.filter(
    (n) => (n.created_at ?? '') <= asOf,
  );

  const row: PingMissionRow | null =
    missions.find((m) => m.mission_id === missionId) ?? null;

  const missionField: FieldState = !row
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : row.mission_type !== 'INTELLIGENCE_RESEARCH'
      ? {
          state: 'NOT_STARTED',
          reason: 'NO_REACHED_MISSION',
          note: `reached mission ${missionId} has mission_type ${String(row.mission_type)}; no INTELLIGENCE_RESEARCH mission exists for this objective`,
        }
      : {
          state: 'KNOWN',
          ...(row.status === 'failed'
            ? { reason: 'MISSION_FAILED' as const }
            : {}),
          data: {
            mission_id: row.mission_id,
            mission_type: row.mission_type,
            status: row.status,
            tenant_id: row.tenant_id,
            assigned_to: row.assigned_to,
            created_by: row.created_by,
            created_at: row.created_at,
            started_at: row.started_at,
            completed_at: row.completed_at,
            ...(row.error ? { error: row.error } : {}),
            trace: {
              lifecycle_event_ids: events
                .filter((e) => LIFECYCLE_TYPES.has(e.event_type))
                .map((e) => e.event_id),
              event_count: events.length,
            },
            sources: ['ping_missions row', 'ping_events (mission lifecycle)'],
          },
        };

  const noMission = missionField.reason === 'NO_REACHED_MISSION';

  const observations = events.filter(
    (e) => e.event_type === 'OBSERVATION_CREATED',
  );
  const observationsField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : observations.length > 0
      ? {
          state: 'KNOWN',
          data: {
            count: observations.length,
            event_ids: observations.map((e) => e.event_id),
            sources: ['ping_events OBSERVATION_CREATED'],
          },
        }
      : { state: 'NOT_STARTED', reason: 'ACQUISITION_NOT_STARTED' };

  const claimEvents = events.filter((e) => e.event_type === 'CLAIM_CREATED');
  const claims = claimEvents.map((e) => {
    const claim = payloadObj(e, 'claim') ?? {};
    const verdict =
      typeof claim.verdict === 'string' && VERDICTS.has(claim.verdict)
        ? claim.verdict
        : 'UNCLEAR';
    const evidence = (claim.evidence as Record<string, unknown> | undefined) ?? null;
    return {
      claim_id: e.event_id,
      verdict,
      subject:
        typeof claim.subject === 'string' ? claim.subject : null,
      text: typeof claim.text === 'string' ? claim.text : null,
      synthesis_tag:
        typeof claim.synthesis_tag === 'string' ? claim.synthesis_tag : null,
      source: {
        event_id: e.event_id,
        upstream_event_id: payloadStr(e, 'upstreamEventId'),
        observation_event_ids: Array.isArray(evidence?.observation_event_ids)
          ? (evidence.observation_event_ids as unknown[])
          : [],
      },
    };
  });
  const claimsField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : claims.length > 0
      ? {
          state: 'KNOWN',
          data: {
            count: claims.length,
            claims,
            sources: ['ping_events CLAIM_CREATED'],
          },
        }
      : { state: 'PENDING', reason: 'CLAIMS_NOT_YET_GENERATED' };

  // Evidence drill-down: claim -> support set -> source/evidence -> verdict.
  // Landed shape only: claim.evidence as written by ClaimWorker (method,
  // observation_event_ids, unclear_reason). Kernel Evidence fields
  // (evidence_type, artifact_id, verify) are absent from landed rows and
  // are never fabricated.
  const evidenceField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : claims.length > 0
      ? {
          state: 'KNOWN',
          data: {
            claims: claimEvents.map((e) => {
              const claim = payloadObj(e, 'claim') ?? {};
              const evidence =
                (claim.evidence as Record<string, unknown> | undefined) ?? null;
              return {
                claim_id: e.event_id,
                verdict:
                  typeof claim.verdict === 'string' &&
                  VERDICTS.has(claim.verdict)
                    ? claim.verdict
                    : 'UNCLEAR',
                support: evidence,
                drill_down: {
                  claim_event_id: e.event_id,
                  upstream_event_id: payloadStr(e, 'upstreamEventId'),
                  observation_event_ids: Array.isArray(
                    evidence?.observation_event_ids,
                  )
                    ? evidence?.observation_event_ids
                    : [],
                },
              };
            }),
            sources: ['ping_events CLAIM_CREATED payload.claim.evidence'],
          },
          note: 'landed evidence shape only; kernel Evidence fields (evidence_type, artifact_id, content, location, verify) are absent from landed rows and not projected',
        }
      : { state: 'PENDING', reason: 'CLAIMS_NOT_YET_GENERATED' };

  const contradictionEvents = events.filter(
    (e) => e.event_type === 'CONTRADICTION_SURFACED',
  );
  const contradictionsField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : contradictionEvents.length > 0
      ? {
          state: 'KNOWN',
          data: {
            count: contradictionEvents.length,
            event_ids: contradictionEvents.map((e) => e.event_id),
            sources: ['ping_events CONTRADICTION_SURFACED'],
          },
        }
      : {
          state: 'NOT_STARTED',
          reason: 'CONTRADICTION_ANALYSIS_NOT_RUN',
          note: 'no canonical contradiction record for this mission in the journal',
        };

  const unclearClaims = claims.filter((c) => c.verdict === 'UNCLEAR');
  const unknownsField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : claims.length > 0
      ? {
          state: 'KNOWN',
          data: {
            items: unclearClaims.map((c) => {
              const ev = claimEvents.find((e) => e.event_id === c.claim_id);
              const claim = (ev && payloadObj(ev, 'claim')) ?? {};
              const evidence =
                (claim.evidence as Record<string, unknown> | undefined) ?? {};
              return {
                claim_id: c.claim_id,
                verdict: 'UNCLEAR',
                text: c.text,
                unclear_reason:
                  typeof evidence.unclear_reason === 'string'
                    ? evidence.unclear_reason
                    : null,
              };
            }),
          },
        }
      : { state: 'PENDING', reason: 'CLAIMS_NOT_YET_GENERATED' };

  const audienceNodes = nodes.filter(
    (n) => n.node_type === 'audience_cluster',
  );
  const audienceField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : audienceNodes.length > 0
      ? {
          state: 'KNOWN',
          data: {
            count: audienceNodes.length,
            nodes: audienceNodes.map((n) => ({
              node_id: n.node_id,
              label: n.label,
              data: n.data,
            })),
            sources: ['knowledge_nodes node_type=audience_cluster'],
          },
        }
      : { state: 'NOT_STARTED', reason: 'AUDIENCE_ANALYSIS_NOT_RUN' };

  const opportunityField: FieldState = {
    state: 'UNKNOWN',
    reason: 'NO_VERIFIED_DEMAND_OBSERVATIONS',
    ...(noMission || nodes.filter((n) => n.node_type === 'opportunity').length === 0
      ? {}
      : {
          data: {
            nodes: nodes
              .filter((n) => n.node_type === 'opportunity')
              .map((n) => ({ node_id: n.node_id, label: n.label })),
          },
        }),
  };

  const artifactField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : { state: 'NOT_STARTED', reason: 'NO_ARTIFACTS_REACHED' };

  // Sources: zero Artifact records linked to this mission. Per the contract
  // field table this is KNOWN count=0 with NO_ARTIFACTS_REACHED: the
  // acquisition ran (observations exist) but retained zero artifacts.
  const sourcesField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'NO_REACHED_MISSION' }
    : {
        state: 'KNOWN',
        reason: 'NO_ARTIFACTS_REACHED',
        data: {
          count: 0,
          artifacts: [],
          acquisition_evidence: observations.map((e) => e.event_id),
        },
      };

  // Approval: landed payload shapes only (action_id, proposed_by/decided_by,
  // evidence_refs; decision time on the event row). The draft's principal /
  // artifact-digest / approval-time bindings do not exist in landed rows.
  const approvalEvents = events.filter((e) => APPROVAL_TYPES.has(e.event_type));
  const proposals = new Map<string, Record<string, unknown>>();
  for (const e of approvalEvents.filter(
    (e) => e.event_type === 'PROPOSED_ACTION',
  )) {
    proposals.set(String(e.payload.action_id ?? e.event_id), {
      action_id: e.payload.action_id ?? null,
      capability: e.payload.capability ?? null,
      proposed_by: e.payload.proposed_by ?? null,
      proposed_at: e.timestamp,
      target_identity: e.payload.target_identity ?? null,
      evidence_refs: e.payload.evidence_refs ?? [],
      risk: e.payload.risk ?? null,
      proposal_event_id: e.event_id,
      decision: null,
    });
  }
  for (const e of approvalEvents.filter((e) =>
    ['ACTION_APPROVED', 'REJECTED'].includes(e.event_type),
  )) {
    const key = String(e.payload.action_id ?? '');
    const p = proposals.get(key);
    const decision = {
      decision: e.event_type === 'ACTION_APPROVED' ? 'APPROVED' : 'REJECTED',
      decided_by: e.payload.decided_by ?? null,
      decided_at: e.timestamp,
      reason: e.payload.reason ?? null,
      decision_event_id: e.event_id,
      decision_event_type: e.event_type,
    };
    if (p) p.decision = decision;
    else
      proposals.set(key || e.event_id, {
        action_id: e.payload.action_id ?? null,
        decision,
        note: 'decision event without a reached PROPOSED_ACTION record',
      });
  }
  const approvalField: FieldState =
    missionId === null
      ? { state: 'NOT_STARTED', reason: 'APPROVAL_NOT_REQUESTED' }
      : noMission
        ? { state: 'NOT_STARTED', reason: 'APPROVAL_NOT_REQUESTED' }
        : approvalEvents.length > 0
          ? {
              state: 'KNOWN',
              data: {
                proposals: [...proposals.values()],
                sources: ['ping_events PROPOSED_ACTION / ACTION_APPROVED / REJECTED'],
              },
              note: 'landed bindings: action_id, proposed_by/decided_by, evidence_refs; decision time on the event row. Draft bindings (principal, artifact digest, approval time in payload) do not exist in landed rows.',
            }
          : { state: 'NOT_STARTED', reason: 'APPROVAL_NOT_REQUESTED' };

  const approvedProposal = [...proposals.values()].find(
    (p) =>
      p.decision !== null &&
      (p.decision as Record<string, unknown>).decision === 'APPROVED',
  );
  const distributionRuns = missions.filter(
    (m) => m.mission_id !== missionId && m.mission_type === 'DISTRIBUTION_RUN',
  );
  const distributionField: FieldState =
    missionId === null || noMission
      ? { state: 'NOT_STARTED', reason: 'ARTIFACT_NOT_APPROVED' }
      : !approvedProposal
        ? { state: 'NOT_STARTED', reason: 'ARTIFACT_NOT_APPROVED' }
        : distributionRuns.length === 0
          ? { state: 'NOT_STARTED', reason: 'DISTRIBUTION_NOT_ATTEMPTED' }
          : {
              state: 'KNOWN',
              data: {
                runs: distributionRuns.map((m) => ({
                  mission_id: m.mission_id,
                  status: m.status,
                })),
                sources: ['ping_missions mission_type=DISTRIBUTION_RUN'],
              },
            };

  const distributionAttempted =
    distributionField.state === 'KNOWN' ||
    (distributionField.state === 'PENDING');
  const effectField: FieldState =
    missionId === null || noMission || !distributionAttempted
      ? { state: 'NOT_STARTED', reason: 'DISTRIBUTION_NOT_ATTEMPTED' }
      : { state: 'PENDING', reason: 'OBSERVATION_WINDOW_OPEN' };

  const completedEvent = events.find(
    (e) => e.event_type === 'MISSION_COMPLETED',
  );
  const completedResult = completedEvent
    ? (payloadObj(completedEvent, 'result') ?? null)
    : null;
  const outcomeField: FieldState =
    missionId === null || noMission || !distributionAttempted
      ? {
          state: 'NOT_STARTED',
          reason: 'DISTRIBUTION_NOT_ATTEMPTED',
          ...(completedResult
            ? {
                note:
                  'research outcome (findings) is under the mission result, not an EXPERIMENT_RUN/DISTRIBUTION_RUN outcome',
              }
            : {}),
        }
      : { state: 'PENDING', reason: 'OBSERVATION_WINDOW_OPEN' };

  const learningNodes = nodes.filter((n) => n.node_type === 'learning');
  const learningField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'LEARNING_NOT_RECORDED' }
    : learningNodes.length > 0
      ? {
          state: 'KNOWN',
          data: {
            nodes: learningNodes.map((n) => ({
              node_id: n.node_id,
              label: n.label,
              confidence: n.confidence,
              source_event_id: n.source_event_id,
            })),
            sources: ['knowledge_nodes node_type=learning'],
          },
        }
      : {
          state: 'NOT_STARTED',
          reason: 'LEARNING_NOT_RECORDED',
          ...(completedEvent
            ? {
                note: `mission result carries a learning string (MISSION_COMPLETED ${completedEvent.event_id}); no learning knowledge_node written`,
              }
            : {}),
        };

  // next_question: ORCA compounding chain OUTCOME -> ... -> NEXT MISSION.
  // The ClaimMissionChainer reified the UNCLEAR claim as a real follow-up
  // INTELLIGENCE_RESEARCH mission: that is the canonical next question,
  // with the causal link intact.
  const followUps = missions.filter(
    (m) =>
      m.mission_id !== missionId &&
      m.mission_type === 'INTELLIGENCE_RESEARCH',
  );
  const nextQuestionField: FieldState = noMission
    ? { state: 'NOT_STARTED', reason: 'LEARNING_NOT_RECORDED' }
    : followUps.length > 0
      ? {
          state: 'KNOWN',
          data: {
            proposed_question:
              completedResult &&
              typeof completedResult.next_question === 'string'
                ? completedResult.next_question
                : null,
            causal_link: {
              unclear_claim_event_ids: unclearClaims.map((c) => c.claim_id),
              chainer: 'claim-mission-chainer',
            },
            follow_up_missions: followUps.map((m) => ({
              mission_id: m.mission_id,
              status: m.status,
              tenant_id: m.tenant_id,
              created_at: m.created_at,
            })),
            sources: ['ping_missions (chained follow-up)', 'ping_events MISSION_COMPLETED result.next_question'],
          },
          note: 'derived via the landed ClaimMissionChainer (ORCA planner), not via a learning knowledge_node',
        }
      : { state: 'NOT_STARTED', reason: 'LEARNING_NOT_RECORDED' };

  return {
    objective: { state: 'KNOWN', source: 'operator', text: objectiveText },
    mission: missionField,
    research: {
      sources: sourcesField,
      observations: observationsField,
      claims: claimsField,
      evidence: evidenceField,
      contradictions: contradictionsField,
      unknowns: unknownsField,
    },
    audience: audienceField,
    opportunity: opportunityField,
    artifact: artifactField,
    approval: approvalField,
    distribution: distributionField,
    effect: effectField,
    outcome: outcomeField,
    learning: learningField,
    next_question: nextQuestionField,
    deployment: {
      state: 'UNKNOWN',
      reason: 'SOURCE_TO_SERVED_CHAIN_NOT_CERTIFIED',
    },
    stages: {
      state: 'UNKNOWN',
      reason: 'STAGE_VOCABULARY_UNMAPPED',
      summary: '3/7 UNKNOWN',
      projector_stages: ['PROJECT', 'PLAN', 'VERIFY'],
      driver_stages: ['OBJECT_GRAPH', 'SITE_SPEC'],
      note: 'no proven semantic mapping between projector and driver stage vocabularies; the PING journal carries no stage records',
    },
  };
}
