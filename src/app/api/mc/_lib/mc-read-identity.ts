/**
 * P8 (2026-10-05): authenticated read scope for the MC journal READ routes.
 *
 * Extends the EXISTING caller-key entitlement machinery
 * (mc-dispatch-identity.ts, Mission L write path) to reads. No new
 * authority: the read scope is derived from the credential
 * (x-mc-caller-key -> server-side registry -> CallerContext), never from
 * a header or body. Fail closed on cross-scope reads.
 *
 * Semantics:
 * - Caller key present + valid  -> authenticated scope:
 *   {tenant} UNION entitled_tenants, derived from the registry entry.
 *   An asserted x-mc-tenant header may NARROW the scope but never widen
 *   it; asserting a tenant outside the entitlement -> 403
 *   cross_tenant_denied. The header survives only as fenced
 *   accidental-cross-tenant protection: it is never authorization by
 *   itself.
 * - Caller key present + unknown -> 401 identity_required (never falls
 *   back to the operator view or a header view).
 * - Caller key present, registry unreadable/missing -> 401
 *   identity_required (fail closed when absent; no silent downgrade).
 * - No key + x-mc-tenant asserted -> 401 caller_key_required. A claimed
 *   tenant identity with no credential is not authorization. This is the
 *   P8 fix: the header alone no longer grants a tenant view.
 * - No key + no header -> operator view (the loopback MC page's honest
 *   operator surface, unchanged).
 * - Valid key whose readable set matches nothing -> the read succeeds
 *   with an explicit scope envelope and an empty list. The envelope
 *   (authenticated, agent_id, tenants) distinguishes "your scope matched
 *   nothing" from "there is no data" and from every deny.
 *
 * Observability honesty: every outcome is typed and mutually
 * distinguishable: 400 invalid_caller_tenant / 401 identity_required /
 * 401 caller_key_required / 403 cross_tenant_denied. A deny is never a
 * silent empty; an unknown mission is never presented as a deny.
 *
 * The registry loader is injected so reads load it lazily: it is only
 * touched when a caller key is actually presented. No key -> no registry
 * I/O, operator semantics unchanged. Tests inject a fake registry: no
 * I/O, no network, no store.
 */

import {
  CALLER_KEY_HEADER,
  loadCallerRegistry,
  type CallerContext,
  type CallerRegistry,
} from './mc-dispatch-identity';
import { CALLER_TENANT_HEADER, CALLER_TENANT_RE } from './mc-tenant-gate';

export type ReadScope =
  | { kind: 'operator' }
  | { kind: 'authenticated'; agent_id: string; tenants: string[] };

export type ReadAuthCode =
  | 'invalid_caller_tenant'
  | 'identity_required'
  | 'caller_key_required'
  | 'cross_tenant_denied';

export class ReadAuthError extends Error {
  readonly status: 400 | 401 | 403;
  readonly code: ReadAuthCode;
  constructor(status: 400 | 401 | 403, code: ReadAuthCode) {
    super(code);
    this.name = 'ReadAuthError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The credential-derived readable tenant set: the caller's own tenant
 * plus every explicit entitlement. Pure function of the registry entry.
 */
export function readableTenants(caller: CallerContext): string[] {
  return [...new Set([caller.tenant, ...caller.entitled_tenants])];
}

/**
 * Parse the asserted tenant header. Returns null when absent; throws
 * ReadAuthError(400, 'invalid_caller_tenant') when malformed. The returned
 * value is an ASSERTION, not an authorization: only resolveReadScope
 * decides what it means, and only against a credential.
 */
export function assertedTenant(req: Request): string | null {
  const raw = req.headers.get(CALLER_TENANT_HEADER);
  if (raw === null) return null;
  const tenant = raw.trim();
  if (!CALLER_TENANT_RE.test(tenant)) {
    throw new ReadAuthError(400, 'invalid_caller_tenant');
  }
  return tenant;
}

/**
 * Resolve the read scope for a request, plus the registry entry behind an
 * authenticated scope (null for the operator view). The registry loader
 * runs ONLY when a caller key is presented (lazy, fail-closed when absent).
 *
 * P1 (2026-10-05): factored out of resolveReadScope so the observability
 * scope seam (mc-observability-scope.ts) can enforce the full scope tuple
 * (actor + tenant + capability + visibility + projection scope) on the same
 * credential-derived basis. Behavior identical to resolveReadScope.
 */
export interface ReadScopeResolution {
  scope: ReadScope;
  caller: CallerContext | null;
}

export function resolveReadScopeWithCaller(
  req: Request,
  loadRegistry: () => CallerRegistry = loadCallerRegistry,
): ReadScopeResolution {
  const tenant = assertedTenant(req);
  const key = req.headers.get(CALLER_KEY_HEADER);

  if (key === null) {
    // No credential: a claimed tenant identity is not authorization.
    if (tenant !== null) throw new ReadAuthError(401, 'caller_key_required');
    return { scope: { kind: 'operator' }, caller: null };
  }

  let registry: CallerRegistry;
  try {
    registry = loadRegistry();
  } catch {
    // Registry absent or unreadable with a presented key: fail closed.
    throw new ReadAuthError(401, 'identity_required');
  }
  const caller = registry.agents[key] ?? null;
  if (!caller) throw new ReadAuthError(401, 'identity_required');

  const allowed = new Set(readableTenants(caller));
  if (tenant !== null && !allowed.has(tenant)) {
    throw new ReadAuthError(403, 'cross_tenant_denied');
  }
  return {
    scope: {
      kind: 'authenticated',
      agent_id: caller.agent_id,
      tenants: tenant !== null ? [tenant] : [...allowed],
    },
    caller,
  };
}

/**
 * Resolve the read scope for a request. The registry loader runs ONLY
 * when a caller key is presented (lazy, fail-closed when absent).
 */
export function resolveReadScope(
  req: Request,
  loadRegistry: () => CallerRegistry = loadCallerRegistry,
): ReadScope {
  return resolveReadScopeWithCaller(req, loadRegistry).scope;
}

/** Map a ReadAuthError to its typed JSON response. Re-throws anything else. */
export function readAuthResponse(e: unknown): Response {
  if (e instanceof ReadAuthError) {
    return Response.json({ ok: false, error: e.code }, { status: e.status });
  }
  throw e;
}

/**
 * Read-side filter predicate: keep a record whose tenant is inside the
 * resolved scope. Operator sees everything (loopback operator surface);
 * authenticated callers see only their credential-derived tenants.
 * Records with a null/undefined tenant never leak into an authenticated
 * view (fail closed).
 */
export function inReadScope(
  scope: ReadScope,
  tenant: string | null | undefined,
): boolean {
  if (scope.kind === 'operator') return true;
  return tenant != null && scope.tenants.includes(tenant);
}

/**
 * Explicit scope envelope for read responses. Never a bare list: the
 * consumer can always distinguish an authenticated empty scope ("your
 * credential matched nothing") from no-data and from every deny.
 */
export function scopeEnvelope(scope: ReadScope): object {
  if (scope.kind === 'operator') return { operator: true };
  return {
    authenticated: true,
    agent_id: scope.agent_id,
    tenants: scope.tenants,
  };
}
