/**
 * Mission Control approval gate (99h convergence, block 0-10, Writer A).
 *
 * Gates POST /api/mc/approvals on the EXISTING dispatch identity path
 * (mc-dispatch-identity.ts): the caller presents a provisioned key in the
 * x-mc-caller-key header; the approver is DERIVED from the resolved caller
 * context (agent_id), NEVER from the request body. The browser cannot choose
 * the authoritative approver by sending a string.
 *
 * Fail-closed: registry unreadable/missing, key missing/unknown, or caller
 * with no agent_id -> 401 identity_required. A body approver that differs
 * from the authenticated identity -> 400 approver_mismatch (mirrors the
 * dispatch route's body-tenant mismatch handling).
 *
 * No new identity authority: this reuses loadCallerRegistry()/resolveCaller()
 * and the operator-provisioned registry at CALLER_REGISTRY_PATH.
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
