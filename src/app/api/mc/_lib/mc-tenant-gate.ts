/**
 * Mission L (Q-P0-06 finding #4, 2026-09-27): tenant gate for the MC missions
 * READ routes (GET /api/mc/missions, GET /api/mc/missions/[id]).
 *
 * The missions journal is a single mixed-tenant JSONL BY DESIGN (operator
 * surface on loopback); the gate lives at the READ API, not the journal.
 *
 * Identity model: the caller asserts its tenant via the `x-mc-tenant`
 * header. A loopback caller omitting the header gets the operator view;
 * asserting another tenant's id gets that tenant's view. This stops
 * accidental cross-tenant reads and fails closed on malformed input, but
 * it is NOT authorization against a deliberate loopback caller. (The
 * dispatch POST is stricter: it key-authenticates via `x-mc-caller-key`
 * and refuses body-claimed tenants.)
 *
 * - No header      -> operator view: all missions (the MC page sends no
 *                     header; its honest operator surface is unchanged).
 * - Valid header   -> tenant view: only that tenant's missions. Missions
 *                     with tenant === null are NOT visible here (fail-closed).
 * - Invalid header -> 400 invalid_caller_tenant, fail-closed (never fall
 *                     back to unscoped reads on a malformed identity).
 * - Cross-tenant [id] -> 403 cross_tenant_denied carrying the requested
 *                     mission_id ONLY: no tenant field, no metadata, no hint
 *                     about which tenant owns it.
 *
 * Tenant identity is taken from the header ONLY, never from a body or
 * query param. No new authority, no journal change, no new event types.
 */

export const CALLER_TENANT_HEADER = 'x-mc-tenant';

// Conservative tenant-id shape: covers the journal's existing tenants
// (happy-place, coppersmith-plumbing) and Mission D's synthetic tenants
// (tenant-a-synth), and rejects anything that could smuggle a second
// identity or a path/selector.
export const CALLER_TENANT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export type CallerScope = { kind: 'operator' } | { kind: 'tenant'; tenant: string };

/**
 * Resolve the caller's read scope from the request. Throws
 * Error('invalid_caller_tenant') when the header is present but malformed;
 * callers map that to a 400 typed error and never fall back to unscoped.
 */
export function callerScope(req: Request): CallerScope {
  const raw = req.headers.get(CALLER_TENANT_HEADER);
  if (raw === null) return { kind: 'operator' };
  const tenant = raw.trim();
  if (!CALLER_TENANT_RE.test(tenant)) throw new Error('invalid_caller_tenant');
  return { kind: 'tenant', tenant };
}
