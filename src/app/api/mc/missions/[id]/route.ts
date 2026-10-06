/**
 * Lane D: GET /api/mc/missions/[id] — one mission, fully projected from the
 * EXISTING journal: mission, run, execution, start/end, capabilities granted,
 * artifacts, evidence, events, result, reconciliation state.
 *
 * Mission L (Q-P0-06 finding #4, 2026-09-27): tenant-scoped reads. A caller
 * asserting `x-mc-tenant` may read ONLY missions whose tenant matches; a
 * cross-tenant request gets a typed 403 with the requested mission_id only
 * (no tenant field, no metadata, no hint about the owning tenant). No header
 * means the operator view and is unchanged.
 */

import { loadJournalEvents, nowIso, projectMissions } from '../../_lib/mc-dispatch';
import { callerScope } from '../../_lib/mc-tenant-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let scope;
  try {
    scope = callerScope(req);
  } catch (e) {
    return Response.json({ ok: false, error: 'invalid_caller_tenant' }, { status: 400 });
  }
  let missions;
  try {
    missions = projectMissions(loadJournalEvents());
  } catch (e) {
    return Response.json({ ok: false, error: 'projection_failed', detail: String(e).slice(0, 300) }, { status: 500 });
  }
  const m = missions.find((x) => x.mission_id === id);
  if (!m) {
    // Honest miss: the id is unknown, not a failed mission.
    return Response.json({ ok: false, error: 'unknown_mission', mission_id: id }, { status: 404 });
  }
  if (scope.kind === 'tenant' && m.tenant !== scope.tenant) {
    // Typed deny, zero disclosure: only the requested id, never the
    // mission's tenant or any of its metadata.
    return Response.json({ ok: false, error: 'cross_tenant_denied', mission_id: id }, { status: 403 });
  }
  return Response.json({ ok: true, as_of: nowIso(), mission: m });
}
