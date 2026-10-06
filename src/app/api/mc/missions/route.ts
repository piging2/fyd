/**
 * Lane D: GET /api/mc/missions — mission list, projected live from the
 * EXISTING journal on every request. No cache, no store: refresh preserves
 * state because state lives in the journal; replay reconstructs it because
 * the projection is deterministic.
 *
 * Mission L (Q-P0-06 finding #4, 2026-09-27): tenant-scoped reads. A caller
 * asserting `x-mc-tenant` sees ONLY that tenant's missions. No header means
 * the operator view (the MC page's honest operator surface) and is unchanged.
 */

import { loadJournalEvents, nowIso, projectMissions, journalPath } from '../_lib/mc-dispatch';
import { callerScope } from '../_lib/mc-tenant-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let scope;
  try {
    scope = callerScope(req);
  } catch (e) {
    return Response.json({ ok: false, error: 'invalid_caller_tenant' }, { status: 400 });
  }
  let missions;
  let journal: string;
  try {
    journal = journalPath();
    const all = projectMissions(loadJournalEvents());
    missions = scope.kind === 'tenant' ? all.filter((m) => m.tenant === scope.tenant) : all;
  } catch (e) {
    return Response.json({ ok: false, error: 'projection_failed', detail: String(e).slice(0, 300) }, { status: 500 });
  }
  return Response.json({
    ok: true,
    as_of: nowIso(),
    journal,
    scope: scope.kind === 'tenant' ? { tenant: scope.tenant } : { operator: true },
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
