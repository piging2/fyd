/**
 * Lane MarketingOS: GET /api/mc/marketingos: the MarketingOS projection
 * served from the EXISTING Mission Control surface.
 *
 * projectMarketingOS(objective, mission_id, canonical_state, as_of) over the
 * LIVE PING journal (Pig plane, brain-postgres / ping_runtime, READ-ONLY).
 * No mission_id -> the contract §5 honest empty state, exactly, with no
 * journal access at all.
 *
 * Mission L tenant gate (same discipline as /api/mc/missions).
 * REPAIRED (MC read-authorization repair, staged candidate 2026-11-20):
 * the scope is credential-derived; a credentialed caller sees ONLY
 * missions inside its entitled scope; cross-tenant gets a typed 403
 * carrying the requested mission_id only. An asserted `x-mc-tenant`
 * header alone grants nothing (401 caller_key_required without a key).
 * No key and no header means the operator view and is unchanged.
 *
 * siteId selector (44-check battery re-run clearing change, 2026-11-22):
 * when the caller names a siteId, this surface answers it under the
 * same rule as /api/mc/graph, BEFORE any projection: an unknown tenant
 * is 404 unknown_tenant; a known tenant outside the caller's scope is
 * the typed 403 cross_tenant_denied carrying the requested siteId
 * only. No siteId named: the mission_id selector governs, unchanged.
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
import { inReadScope, readAuthResponse, scopeEnvelope } from '../_lib/mc-read-identity';
import { nowIso } from '../_lib/mc-dispatch';
import { getFydTenantIds } from '@/fyd/data/fyd-tenant-graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const objective = url.searchParams.get('objective') ?? '';
  const missionIdParam = url.searchParams.get('mission_id');

  let scope;
  try {
    scope = callerScope(req);
  } catch (e) {
    return readAuthResponse(e);
  }

  // siteId selector gate: the same typed refusals /api/mc/graph
  // delivers, before any projection is built. Zero disclosure: the
  // 403 carries only the siteId the caller itself named.
  const siteIdParam = url.searchParams.get('siteId');
  if (siteIdParam !== null && siteIdParam !== '') {
    if (!getFydTenantIds().includes(siteIdParam)) {
      return Response.json(
        { ok: false, error: 'unknown_tenant', status: 'PROVEN' },
        { status: 404 },
      );
    }
    if (scope.kind === 'operator') {
      // Case 7 (desk ruling 2026-11-23): a tenant-specific read with
      // no credential is refused in the graph repair's form; the
      // operator view does not extend to tenant-naming reads.
      return Response.json(
        { ok: false, error: 'caller_key_required', status: 'PROVEN' },
        { status: 401 },
      );
    }
    if (!inReadScope(scope, siteIdParam)) {
      return Response.json(
        { ok: false, error: 'cross_tenant_denied', siteId: siteIdParam, status: 'PROVEN' },
        { status: 403 },
      );
    }
  }

  const asOf = nowIso();

  // Honest empty state: pure, no journal access, §5 shape exactly.
  if (missionIdParam === null || missionIdParam === '') {
    return Response.json({
      ok: true,
      as_of: asOf,
      journal: PING_JOURNAL_SOURCE,
      scope: scopeEnvelope(scope),
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
  if (!inReadScope(scope, row.tenant_id)) {
    // Typed deny, zero disclosure: only the requested id, never the
    // mission's tenant or any of its metadata.
    return Response.json({ ok: false, error: 'cross_tenant_denied', mission_id: missionId }, { status: 403 });
  }

  const projection = projectMarketingOS(objective, missionId, canonical, asOf);
  return Response.json({
    ok: true,
    as_of: asOf,
    journal: PING_JOURNAL_SOURCE,
    scope: scopeEnvelope(scope),
    projection: JSON.parse(canonicalJson(projection)),
  });
}
