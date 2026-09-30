/**
 * Mission Control approval gate (99h convergence, block 0-10, Writer A;
 * P0 approval boundary hardening 2026-09-30).
 *
 * Gates POST /api/mc/approvals on the EXISTING dispatch identity path
 * (mc-dispatch-identity.ts): the caller presents a provisioned key in the
 * x-mc-caller-key header; the approver is DERIVED from the resolved caller
 * context (agent_id), NEVER from the request body. The browser cannot choose
 * the authoritative approver by sending a string.
 *
 * The full boundary invariant, enforced here and in route.ts:
 *   NO VALID PRINCIPAL      -> NO APPROVAL  (401 identity_required)
 *   NO REQUIRED CAPABILITY  -> NO APPROVAL  (403 capability_denied)
 *   NO EXACT PROPOSAL DIGEST -> NO APPROVAL (400 bad_digest at the route;
 *                              exact-match refusal in the canonical
 *                              Python transition, no state change)
 *   NO TENANT/OWNER MATCH   -> NO APPROVAL  (403 tenant_not_entitled:
 *                              the caller must be entitled to its derived
 *                              tenant; the proposal record carries no
 *                              tenant field, so the enforceable match at
 *                              this boundary is caller-side entitlement.
 *                              See route.ts.)
 *
 * Fail-closed: registry unreadable/missing, key missing/unknown, or caller
 * with no agent_id -> 401 identity_required. A body approver that differs
 * from the authenticated identity -> 400 approver_mismatch (mirrors the
 * dispatch route's body-tenant mismatch handling). A caller that does not
 * hold the proposal's recorded capability -> 403 capability_denied. A
 * caller not entitled to its derived tenant -> 403 tenant_not_entitled.
 *
 * No new identity authority: this reuses loadCallerRegistry()/resolveCaller()
 * and the operator-provisioned registry at CALLER_REGISTRY_PATH. Capability
 * grants live in the same registry file (operator-provisioned); this module
 * only reads them.
 */

import {
  loadCallerRegistry,
  resolveCaller,
  type CallerContext,
  type CallerRegistry,
} from './mc-dispatch-identity';

function bad(status: number, error: string, detail?: string) {
  return Response.json({ ok: false, error, detail: detail ?? null }, { status });
}

export type GateOk = { ok: true; caller: CallerContext };
export type GateRefused = { ok: false; response: Response };

/**
 * Resolve the trusted caller for an approvals POST. Returns the caller
 * context on success, or a ready-to-return refusal Response on any failure.
 */
export function gateApprovalCaller(req: Request): GateOk | GateRefused {
  let registry: CallerRegistry;
  try {
    registry = loadCallerRegistry();
  } catch (e) {
    return {
      ok: false,
      response: bad(
        401,
        'identity_required',
        `caller registry unreadable, refusing: ${String(e).slice(0, 200)}`,
      ),
    };
  }
  const caller = resolveCaller(req, registry);
  if (!caller || typeof caller.agent_id !== 'string' || !caller.agent_id) {
    return {
      ok: false,
      response: bad(
        401,
        'identity_required',
        'a provisioned caller key (x-mc-caller-key) is required: the approver is derived from the authenticated caller, never from the request body.',
      ),
    };
  }
  return { ok: true, caller };
}

export type ApproverOk = { ok: true; approver: string };
export type ApproverRefused = { ok: false; response: Response };

/**
 * Derive the approver from the authenticated caller. A body approver that is
 * present and differs from the authenticated identity is refused (fail
 * closed, explicit). An absent body approver falls back to the identity.
 */
export function resolveApprover(caller: CallerContext, body: any): ApproverOk | ApproverRefused {
  const bodyApprover = typeof body?.approver === 'string' && body.approver ? body.approver : '';
  if (bodyApprover && bodyApprover !== caller.agent_id) {
    return {
      ok: false,
      response: bad(
        400,
        'approver_mismatch',
        `body approver '${bodyApprover.slice(0, 120)}' does not match the authenticated caller '${caller.agent_id}': the approver is derived, never asserted.`,
      ),
    };
  }
  return { ok: true, approver: caller.agent_id };
}

export type CheckOk = { ok: true };
export type CheckRefused = { ok: false; response: Response };

/**
 * NO REQUIRED CAPABILITY -> NO APPROVAL.
 * The required capability is the proposal record's recorded capability
 * (read from the canonical store, never from the request body). The caller
 * must hold it in its operator-provisioned registry grants. Fail closed:
 * a caller with no granted capabilities approves nothing.
 */
export function gateApprovalCapability(
  caller: CallerContext,
  requiredCapability: unknown,
): CheckOk | CheckRefused {
  const need =
    typeof requiredCapability === 'string' && requiredCapability
      ? requiredCapability
      : '';
  if (!need || !caller.capabilities.includes(need)) {
    return {
      ok: false,
      response: bad(
        403,
        'capability_denied',
        `caller '${caller.agent_id}' does not hold capability '${need || '(none declared on record)'}': NO REQUIRED CAPABILITY -> NO APPROVAL. ` +
          `Operator: grant it in this caller's "capabilities" array in the caller registry, then retry.`,
      ),
    };
  }
  return { ok: true };
}

/**
 * NO TENANT/OWNER MATCH -> NO APPROVAL (caller-side enforcement).
 * The caller must be entitled to its derived tenant (mirrors the dispatch
 * route's tenant_not_entitled check). The approval record carries no tenant
 * field, so no proposal-side match is representable at this boundary; this
 * check keeps a mis-provisioned or cross-scope caller from deciding.
 */
export function gateApprovalTenant(caller: CallerContext): CheckOk | CheckRefused {
  if (!caller.entitled_tenants.includes(caller.tenant)) {
    return {
      ok: false,
      response: bad(
        403,
        'tenant_not_entitled',
        `caller '${caller.agent_id}' is not entitled to its derived tenant '${caller.tenant}': NO TENANT MATCH -> NO APPROVAL.`,
      ),
    };
  }
  return { ok: true };
}
