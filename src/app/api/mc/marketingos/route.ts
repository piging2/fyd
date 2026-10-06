/**
 * Lane MarketingOS: GET /api/mc/marketingos — the MarketingOS projection
 * served from the EXISTING Mission Control surface.
 *
 * projectMarketingOS(objective, mission_id, canonical_state, as_of) over the
 * LIVE PING journal (Pig plane, brain-postgres / ping_runtime, READ-ONLY).
 * No mission_id -> the contract §5 honest empty state, exactly, with no
 * journal access at all.
 *
 * Mission L tenant gate (same discipline as /api/mc/missions): a caller
 * asserting `x-mc-tenant` sees ONLY that tenant's mission; cross-tenant
 * gets a typed 403 carrying the requested mission_id only. No header means
 * the operator view and is unchanged.
 *
 * Fail-closed: journal unreachable -> 503 ping_journal_unreachable, never an
 * invented empty state. Unknown mission id -> 404 unknown_mission.
 */

import {
  MISSION_ID_RE,
  PING_JOURNAL_SOURCE,
  loadMarketingOSCanonicalState,
} from '../_lib/mc-ping-journal';
import {
  canonicalJson,
  emptyMarketingOSProjection,
  projectMarketingOS,
} from '../_lib/mc-marketingos';
import { callerScope } from '../_lib/mc-tenant-gate';
import { nowIso } from '../_lib/mc-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const objective = url.searchParams.get('objective') ?? '';
  const missionIdParam = url.searchParams.get('mission_id');

  let scope;
  try {
    scope = callerScope(req);
  } catch {
    return Response.json({ ok: false, error: 'invalid_caller_tenant' }, { status: 400 });
  }

  const asOf = nowIso();

  // Honest empty state: pure, no journal access, §5 shape exactly.
  if (missionIdParam === null || missionIdParam === '') {
    return Response.json({
      ok: true,
      as_of: asOf,
      journal: PING_JOURNAL_SOURCE,
      scope: scope.kind === 'tenant' ? { tenant: scope.tenant } : { operator: true },
      projection: JSON.parse(canonicalJson(emptyMarketingOSProjection(objective))),
    });
  }

  const missionId = missionIdParam.trim();
  if (!MISSION_ID_RE.test(missionId)) {
    return Response.json({ ok: false, error: 'invalid_mission_id' }, { status: 400 });
  }

  let canonical;
  try {
    canonical = await loadMarketingOSCanonicalState(missionId);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('invalid_mission_id')) {
      return Response.json({ ok: false, error: 'invalid_mission_id' }, { status: 400 });
    }
    // Fail-closed: an unreachable journal is a 503, never a faked projection.
    return Response.json(
      { ok: false, error: 'ping_journal_unreachable', detail: msg.slice(0, 200) },
      { status: 503 },
    );
  }

  const row = canonical.missions.find((m) => m.mission_id === missionId) ?? null;
  if (!row) {
    // Honest miss: the id is unknown, not a failed mission.
    return Response.json({ ok: false, error: 'unknown_mission', mission_id: missionId }, { status: 404 });
  }
  if (scope.kind === 'tenant' && row.tenant_id !== scope.tenant) {
    // Typed deny, zero disclosure: only the requested id, never the
    // mission's tenant or any of its metadata.
    return Response.json({ ok: false, error: 'cross_tenant_denied', mission_id: missionId }, { status: 403 });
  }

  const projection = projectMarketingOS(objective, missionId, canonical, asOf);
  return Response.json({
    ok: true,
    as_of: asOf,
    journal: PING_JOURNAL_SOURCE,
    scope: scope.kind === 'tenant' ? { tenant: scope.tenant } : { operator: true },
    projection: JSON.parse(canonicalJson(projection)),
  });
}
