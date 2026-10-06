/**
 * Lane MarketingOS: GET /api/mc/marketingos/missions — read-only list of
 * INTELLIGENCE_RESEARCH missions in the live PING journal, for the MC
 * MarketingOS picker. Same tenant gate as the sibling routes: a caller
 * asserting `x-mc-tenant` sees only that tenant's missions.
 */

import {
  PING_JOURNAL_SOURCE,
  listIntelligenceResearchMissions,
} from '../../_lib/mc-ping-journal';
import { callerScope } from '../../_lib/mc-tenant-gate';
import { nowIso } from '../../_lib/mc-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let scope;
  try {
    scope = callerScope(req);
  } catch {
    return Response.json({ ok: false, error: 'invalid_caller_tenant' }, { status: 400 });
  }
  let missions;
  try {
    const all = await listIntelligenceResearchMissions();
    missions =
      scope.kind === 'tenant'
        ? all.filter((m) => m.tenant_id === scope.tenant)
        : all;
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
    scope: scope.kind === 'tenant' ? { tenant: scope.tenant } : { operator: true },
    mission_count: missions.length,
    missions,
  });
}
