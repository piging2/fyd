/**
 * GET /api/mc/lineage — the ONE operational spine.
 *
 * A read-only projection over EXISTING truth. No new store, no new
 * authority, no new scheduler. Every section carries an explicit source
 * label: LIVE / PROJECTED / DERIVED / MOCK / UNKNOWN.
 *
 * Views (exactly one selector required):
 *   ?missionId=<id>   MISSION -> RUN -> EXECUTION -> AGENT -> RESULT
 *                      -> EVIDENCE -> EVENT. Selecting a mission exposes
 *                      its complete lineage in one call.
 *   ?proposalId=<id>  INTENT -> PROPOSAL -> CAPABILITY EVALUATION
 *                      -> DECISION -> RESULTING EVENTS.
 *   ?eventId=<id>     EVENT -> AFFECTED EVIDENCE -> AFFECTED OBJECTS
 *                      (forward lineage; delegates to the trace-forward
 *                      seam rather than duplicating it).
 */

import {
  journalPath,
  loadJournalEvents,
  nowIso,
  projectMissions,
} from '../_lib/mc-dispatch';
import { missionSpine, stage, type SpineSource } from '../_lib/mc-lineage';
import { callerScope } from '../_lib/mc-tenant-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bad(status: number, error: string, detail?: string) {
  return Response.json({ ok: false, error, detail: detail ?? null }, { status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const missionId = url.searchParams.get('missionId');
  const proposalId = url.searchParams.get('proposalId');
  const eventId = url.searchParams.get('eventId');
  const selectors = [missionId, proposalId, eventId].filter(Boolean);
  if (selectors.length !== 1) {
    return bad(400, 'bad_selector', 'Provide exactly one of: missionId, proposalId, eventId.');
  }

  let scope;
  try {
    scope = callerScope(req);
  } catch {
    return bad(400, 'invalid_caller_tenant', null);
  }

  // ---- MISSION view ----
  if (missionId) {
    let missions;
    try {
      journalPath();
      missions = projectMissions(loadJournalEvents());
    } catch (e) {
      return bad(500, 'projection_failed', String(e).slice(0, 300));
    }
    const m = missions.find((x) => x.mission_id === missionId);
    if (!m) return bad(404, 'unknown_mission', missionId);
    if (scope.kind === 'tenant' && m.tenant !== scope.tenant) {
      return bad(403, 'cross_tenant_denied', missionId);
    }
    return Response.json({
      ok: true,
      as_of: nowIso(),
      view: 'mission',
      mission_id: m.mission_id,
      spine_source: 'PROJECTED' as SpineSource,
      spine_note:
        "Assembled in one call from the live journal projection. LIVE sections read journal rows directly; PROJECTED sections are this endpoint's assembly. No MOCK data is served on this path.",
      spine: missionSpine(m),
    });
  }

  // ---- PROPOSAL view ----
  if (proposalId) {
    const approvalsUrl = `/api/mc/approvals?proposal_id=${encodeURIComponent(proposalId)}`;
    return Response.json({
      ok: true,
      as_of: nowIso(),
      view: 'proposal',
      proposal_id: proposalId,
      spine_source: 'PROJECTED' as SpineSource,
      spine_note:
        'Proposal lineage delegates to GET /api/mc/approvals for the recorded proposal and decision. This view is a labeled assembly, not a second approval store.',
      delegated_to: approvalsUrl,
      spine: [
        stage('INTENT', 'UNKNOWN', 'owner intent is recorded in the proposal summary when present; no separate intent store exists', null),
        stage('PROPOSAL', 'LIVE', 'recorded proposal via /api/mc/approvals', { delegated_to: approvalsUrl }),
        stage(
          'CAPABILITY_EVALUATION',
          'PROJECTED',
          'the approvals gate enforces: NO VALID PRINCIPAL -> NO APPROVAL; NO REQUIRED CAPABILITY -> NO APPROVAL; NO EXACT DIGEST -> NO APPROVAL; NO TENANT MATCH -> NO APPROVAL',
          null,
        ),
        stage('DECISION', 'LIVE', 'recorded decision via /api/mc/approvals; silence never approves', null),
        stage('RESULTING_EVENTS', 'LIVE', 'MC_APPROVAL_APPROVED or MC_APPROVAL_DENIED in the journal', null),
      ],
    });
  }

  // ---- EVENT view ----
  const traceUrl = `/api/mc/trace-forward?eventId=${encodeURIComponent(eventId!)}`;
  return Response.json({
    ok: true,
    as_of: nowIso(),
    view: 'event',
    event_id: eventId,
    spine_source: 'PROJECTED' as SpineSource,
    spine_note:
      'Forward lineage delegates to GET /api/mc/trace-forward rather than duplicating it. That seam matches provenance refs (ping-event:<id>) against tenant graphs.',
    delegated_to: traceUrl,
    spine: [
      stage('EVENT', 'LIVE', 'the journal event envelope is the source change', { event_id: eventId }),
      stage('AFFECTED_EVIDENCE', 'LIVE', 'via /api/mc/trace-forward', { delegated_to: traceUrl }),
      stage('AFFECTED_OBJECTS', 'LIVE', 'via /api/mc/trace-forward', { delegated_to: traceUrl }),
      stage('AFFECTED_PROJECTION', 'DERIVED', 'rebuilt from the event through the authorized seam; corrupt projections fail typed, never silently', null),
    ],
  });
}
