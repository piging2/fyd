/**
 * Lane MarketingOS: GET /api/mc/marketingos/missions — read-only list of
 * INTELLIGENCE_RESEARCH missions in the live PING journal, for the MC
 * MarketingOS picker. Same tenant gate as the sibling routes.
 * REPAIRED (MC read-authorization repair, staged candidate 2026-11-20):
 * the scope is credential-derived; a credentialed caller sees only its
 * entitled tenants' missions, and an asserted `x-mc-tenant` header
 * alone grants nothing (401 caller_key_required without a key).
 *
 * siteId selector (44-check battery re-run clearing change, 2026-11-22):
 * when the caller names a siteId, this surface answers it under the
 * same rule as /api/mc/graph, BEFORE any journal read: an unknown
 * tenant is 404 unknown_tenant; a known tenant outside the caller's
 * scope is the typed 403 cross_tenant_denied carrying the requested
 * siteId only. No siteId named: the scope-filtered list is unchanged.
 */

import {
  PING_JOURNAL_SOURCE,
  listIntelligenceResearchMissions,
} from '../../_lib/mc-ping-journal';
import { callerScope } from '../../_lib/mc-tenant-gate';
import { inReadScope, readAuthResponse, scopeEnvelope } from '../../_lib/mc-read-identity';
import { nowIso } from '../../_lib/mc-dispatch';
import { getFydTenantIds } from '@/fyd/data/fyd-tenant-graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let scope;
  try {
    scope = callerScope(req);
  } catch (e) {
    return readAuthResponse(e);
  }
  // siteId selector gate: the same typed refusals /api/mc/graph
  // delivers, before any journal read. Zero disclosure: the 403
  // carries only the siteId the caller itself named.
  const siteIdParam = new URL(req.url).searchParams.get('siteId');
  if (siteIdParam !== null && siteIdParam !== '') {
    if (!getFydTenantIds().includes(siteIdParam)) {
      return Response.json(
        { ok: false, error: 'unknown_tenant', status: 'PROVEN' },
        { status: 404 },
      );
    }
    if (!inReadScope(scope, siteIdParam)) {
      return Response.json(
        { ok: false, error: 'cross_tenant_denied', siteId: siteIdParam, status: 'PROVEN' },
        { status: 403 },
      );
    }
  }
  let missions;
  try {
    const all = await listIntelligenceResearchMissions();
    missions = all.filter((m) => inReadScope(scope, m.tenant_id));
  } catch (e) {
    return Response.json(
      { ok: false, error: 'ping_journal_unreachable', detail: String(e).slice(0, 200) },
      { status: 503 },
    );
  }
  return Response.json({
    ok: true,
    as_of: nowIso(),
    journal: PING_JOURNAL_SOURCE,
    scope: scopeEnvelope(scope),
    mission_count: missions.length,
    missions,
  });
}
