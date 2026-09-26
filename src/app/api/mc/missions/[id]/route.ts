/**
 * Lane D: GET /api/mc/missions/[id] — one mission, fully projected from the
 * EXISTING journal: mission, run, execution, start/end, capabilities granted,
 * artifacts, evidence, events, result, reconciliation state.
 */

import { loadJournalEvents, nowIso, projectMissions } from '../../_lib/mc-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
  return Response.json({ ok: true, as_of: nowIso(), mission: m });
}
