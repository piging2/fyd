/**
 * Lane Queue: GET /api/mc/queue — the mission queue projected live from the
 * EXISTING journal on every request. No cache, no store, no new authority:
 * rows come from brain-postgres / ping_runtime.ping_missions via the
 * read-only mc-ping-journal adapter, and mc-queue-project.ts maps them into
 * Nolan's canonical vocabulary (PROPOSED / EXECUTED / FAILED / UNKNOWN ...)
 * with a DERIVED health field.
 *
 * Fail-closed: journal unreachable -> 503 DEGRADED with no invented missions,
 * never an unhandled 500. Zero rows -> the honest empty state, 200, never
 * mock data.
 *
 * R10 (2026-11-23): this surface is tenant-bearing by construction
 * (every row carries tenant attribution), so it is scoped in the
 * read-authorization arc's form: an unauthenticated caller is
 * refused 401 caller_key_required before the journal leg, and a
 * credentialed caller receives only rows inside its
 * credential-derived scope.
 */

import {
  PING_JOURNAL_SOURCE,
  listPingQueueMissions,
} from '../_lib/mc-ping-journal';
import { projectQueueMissions } from '../_lib/mc-queue-project';
import { nowIso } from '../_lib/mc-dispatch';
import { callerScope } from '../_lib/mc-tenant-gate';
import { inReadScope, readAuthResponse } from '../_lib/mc-read-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let scope;
  try {
    scope = callerScope(req);
  } catch (err) {
    return readAuthResponse(err);
  }
  if (scope.kind === 'operator') {
    return Response.json(
      { ok: false, error: 'caller_key_required', status: 'PROVEN' },
      { status: 401 },
    );
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

  const missions = projectQueueMissions(rows).filter((m) =>
    inReadScope(scope, m.tenant_id),
  );

  if (missions.length === 0) {
    return Response.json({
      ok: true,
      missions: [],
      note: 'no missions recorded in substrate',
    });
  }

  return Response.json({
    ok: true,
    as_of: nowIso(),
    journal: PING_JOURNAL_SOURCE,
    mission_count: missions.length,
    missions,
  });
}
