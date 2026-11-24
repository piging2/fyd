/**
 * Lane Queue: GET /api/mc/queue — the mission queue projected live from the
 * EXISTING journal on every request. No cache, no store, no new authority:
 * rows come from brain-postgres / ping_runtime.ping_missions via the
 * read-only mc-ping-journal adapter, and mc-queue-project.ts maps them into
 * Nolan's canonical vocabulary (PROPOSED / EXECUTED / FAILED / UNKNOWN ...)
 * with a DERIVED health field.
 *
 * REPAIRED (R10, P-055 family; TenantOS research segment B, 2026-11-23;
 * staged candidate 2026-11-23): this route previously carried NO read
 * gate at all: it served every tenant's rows, with tenant attribution,
 * to any caller. It now resolves the same credential-derived read scope
 * as the repaired read routes (callerScope delegates to resolveReadScope
 * in mc-read-identity.ts) BEFORE any journal read, filters the rows with
 * inReadScope, and reports the scope via scopeEnvelope. An asserted
 * `x-mc-tenant` header alone grants nothing (401 caller_key_required);
 * with a key it may only narrow the caller's entitled scope (asserting
 * outside the entitlement is 403 cross_tenant_denied); an unknown key is
 * 401 identity_required; a malformed header is 400
 * invalid_caller_tenant. No key and no header remains the operator view
 * (the MC page's honest operator surface) and is unchanged. Tenant-less
 * rows never enter an authenticated view (fail closed, inReadScope).
 *
 * Fail-closed: journal unreachable -> 503 DEGRADED with no invented missions,
 * never an unhandled 500. Zero rows in scope -> the honest empty state,
 * 200, never mock data; the scope envelope distinguishes an authenticated
 * scope that matched nothing from an empty substrate.
 */

import {
  PING_JOURNAL_SOURCE,
  listPingQueueMissions,
} from '../_lib/mc-ping-journal';
import { projectQueueMissions } from '../_lib/mc-queue-project';
import { nowIso } from '../_lib/mc-dispatch';
import { callerScope } from '../_lib/mc-tenant-gate';
import {
  inReadScope,
  readAuthResponse,
  scopeEnvelope,
} from '../_lib/mc-read-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let scope;
  try {
    scope = callerScope(req);
  } catch (e) {
    return readAuthResponse(e);
  }

  let rows;
  try {
    rows = await listPingQueueMissions();
  } catch {
    // DEGRADED, never an invented queue: the substrate could not be read.
    return Response.json(
      { ok: false, status: 'DEGRADED', error: 'ping journal unreachable' },
      { status: 503 },
    );
  }

  const missions = projectQueueMissions(
    rows.filter((r) => inReadScope(scope, r.tenant_id)),
  );

  if (missions.length === 0) {
    return Response.json({
      ok: true,
      scope: scopeEnvelope(scope),
      missions: [],
      note:
        scope.kind === 'operator'
          ? 'no missions recorded in substrate'
          : 'no missions in the caller read scope',
    });
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
