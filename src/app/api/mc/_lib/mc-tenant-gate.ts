/**
 * Mission L (Q-P0-06 finding #4, 2026-09-27): tenant gate for the MC
 * READ routes. REPAIRED (MC read-authorization repair, staged candidate
 * 2026-11-20): the gate no longer derives read scope from the
 * client-supplied `x-mc-tenant` header.
 *
 * The missions journal is a single mixed-tenant JSONL BY DESIGN (operator
 * surface on loopback); the gate lives at the READ API, not the journal.
 *
 * Identity model (P8 semantics, mc-read-identity.ts): read scope is
 * DERIVED from the caller's credential (x-mc-caller-key -> server-side
 * registry -> CallerContext), never from a header or body.
 * `callerScope` below is a thin delegate over `resolveReadScope`, kept
 * under this module's name so every existing consumer resolves scope
 * through the one credential-derived resolver; there is no second
 * scope implementation.
 *
 * - No key + no header -> operator view: all missions (the MC page
 *                     sends neither; its honest operator surface is
 *                     unchanged).
 * - No key + header  -> 401 caller_key_required: a claimed tenant
 *                     identity with no credential is not authorization.
 *                     (BEFORE THE REPAIR: the header alone granted that
 *                     tenant's view, and an omitted header selected
 *                     the operator view for any caller.)
 * - Valid key        -> authenticated scope: the caller's own tenant
 *                     UNION entitled_tenants, derived from the registry
 *                     entry. An asserted x-mc-tenant header may NARROW
 *                     the scope but never widen it; asserting a tenant
 *                     outside the entitlement -> 403
 *                     cross_tenant_denied (the assertion is denied as
 *                     a mismatch, never honored).
 * - Unknown key, or registry unreadable with a key presented
 *                    -> 401 identity_required, fail closed.
 * - Malformed header -> 400 invalid_caller_tenant, fail closed (never
 *                     fall back to unscoped reads on a malformed
 *                     identity).
 * - Cross-tenant [id] -> 403 cross_tenant_denied carrying the requested
 *                     mission_id ONLY: no tenant field, no metadata, no
 *                     hint about which tenant owns it (enforced at the
 *                     routes via inReadScope).
 *
 * Tenant identity is taken from the credential ONLY; the header is an
 * assertion that may narrow, never grant. No new authority, no journal
 * change, no new event types.
 */

import {
  resolveReadScope,
  type ReadScope,
} from './mc-read-identity';
import type { CallerRegistry } from './mc-dispatch-identity';

export const CALLER_TENANT_HEADER = 'x-mc-tenant';

// Conservative tenant-id shape: covers the journal's existing tenants
// (happy-place, coppersmith-plumbing) and Mission D's synthetic tenants
// (tenant-a-synth), and rejects anything that could smuggle a second
// identity or a path/selector.
export const CALLER_TENANT_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/**
 * The read scope type for the MC read routes. Since the repair this is
 * exactly the credential-derived ReadScope of mc-read-identity.ts:
 * { kind: 'operator' } or { kind: 'authenticated', agent_id, tenants }.
 * The pre-repair single-tenant header scope ({ kind: 'tenant' }) no
 * longer exists anywhere in the read path.
 */
export type CallerScope = ReadScope;

/**
 * Resolve the caller's read scope from the request. Delegates to
 * resolveReadScope (mc-read-identity.ts): the scope is derived from
 * the presented credential against the caller registry, and the
 * asserted x-mc-tenant header is honored only as a narrowing inside
 * that entitlement. Throws ReadAuthError (typed 400 / 401 / 403) on
 * every deny; callers map it via readAuthResponse and never fall back
 * to unscoped reads. The registry loader is injectable for tests, as
 * in resolveReadScope.
 */
export function callerScope(
  req: Request,
  loadRegistry?: () => CallerRegistry,
): CallerScope {
  return resolveReadScope(req, loadRegistry);
}
