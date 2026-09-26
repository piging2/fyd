/**
 * Lane D: GET /api/mc/missions — mission list, projected live from the
 * EXISTING journal on every request. No cache, no store: refresh preserves
 * state because state lives in the journal; replay reconstructs it because
 * the projection is deterministic.
 */

import { loadJournalEvents, nowIso, projectMissions, JOURNAL_PATH } from '../_lib/mc-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let missions;
  try {
    missions = projectMissions(loadJournalEvents());
  } catch (e) {
    return Response.json({ ok: false, error: 'projection_failed', detail: String(e).slice(0, 300) }, { status: 500 });
  }
  return Response.json({
    ok: true,
    as_of: nowIso(),
    journal: JOURNAL_PATH,
    mission_count: missions.length,
    missions: missions.map((m) => ({
      mission_id: m.mission_id,
      run_id: m.run_id,
      execution_id: m.execution_id,
      status: m.status,
      agent: m.agent,
      tenant: m.tenant,
      capability: m.capability,
      work_order_id: m.work_order_id,
      started_at: m.started_at,
      ended_at: m.ended_at,
      reconciliation_state: m.reconciliation_state,
      artifact_count: m.artifacts.length,
      event_count: m.events.length,
    })),
  });
}
