/**
 * OwnerContext: the single owner-context seam for the owner overrides
 * route. FYD directive (DECISIONS-LOCKED 2026-09-22, OWNER GATE):
 *
 *   OwnerContext interface
 *   -> DemoOwnerContext today
 *   -> PING identity/capability implementation later.
 *
 * No scattered if(demoOwner) through product code: the route speaks ONLY
 * this interface. Tenant scoping, the acting owner actor, capability +
 * policy evaluation, and demo disclosure labeling all flow through it.
 *
 * Replacing DemoOwnerContext with a PING identity/capability
 * implementation changes this file (one class) and nothing else: no call
 * site touches the tenant module, the demo chain, or a demo label
 * directly.
 *
 * Demo honesty is structural, not decorative: every response stamped
 * through the seam carries the demo disclosure, and the actor is always
 * the seeded demo actor, never a verified owner identity. Demo auth is
 * never presented as production auth.
 */

import {
  chainAuditView,
  resolveOwnerCorrectionChain,
  type OwnerCorrectionChain,
} from "@/fyd/owner-mode/demo-chain";
import { requireTenantContext } from "@/fyd/tenant/tenant-context";
import {
  demoActorContext,
  type OwnerActor,
  type OwnerActorContext,
} from "./patch-loop";

/** One capability + policy evaluation, as seen by the route. */
export interface OwnerCapabilityEvaluation {
  capability: string;
  allowed: boolean;
  reason: string;
}

/**
 * The owner context seam. A future PING-backed implementation satisfies
 * this contract with real identity and capability semantics; the route
 * cannot tell the difference except through the disclosure it stamps.
 */
export interface OwnerContext {
  /** The tenant this context acts for (server-verified). */
  readonly tenantId: string;
  /**
   * The acting owner actor, future-neutral. Demo: the seeded demo actor,
   * labeled as such (an OwnerActorContext with demoOwnerContext: true).
   * A PING-backed implementation supplies a verified owner identity with
   * no demo marker.
   */
  readonly actor: OwnerActor;
  /** Human-readable statement of what this context is and is not. */
  readonly disclosure: string;
  /**
   * Label stamped on EVERY response served through this context, success
   * or refusal. It is impossible to get a response through the seam that
   * does not disclose the context's nature.
   */
  responseLabel(): Record<string, unknown>;
  /**
   * INTENT -> IDENTITY -> CAPABILITY + POLICY evaluation for one owner
   * action on one object. Pure: performs no mutation and writes nothing.
   * Approval is never a capability grant: a denied evaluation refuses the
   * effect regardless of any approval presented.
   */
  evaluateCapability(
    objectId: string,
    capability: string,
  ): Promise<OwnerCapabilityEvaluation>;
  /**
   * Human impact sentence for the propose-stage preview, describing the
   * evaluation that would gate the apply step.
   */
  capabilityImpactLine(evaluation: OwnerCapabilityEvaluation): string;
  /** JSON-safe audit view for route responses and server logs. */
  auditView(): Record<string, unknown>;
}

/**
 * The single construction point for the route's OwnerContext. The route
 * calls this factory and nothing else: replacing the demo implementation
 * with a PING identity/capability implementation means changing this
 * factory's body, not the route and not the call sites. Until real owner
 * auth exists it returns the demo implementation, and every response it
 * stamps discloses that.
 */
export async function createOwnerContext(
  tenantId: string,
): Promise<OwnerContext> {
  return DemoOwnerContext.forTenant(tenantId);
}

/**
 * The refusal label for failures that happen before any context exists
 * (e.g. an invalid tenant id). No response from the route may leave
 * unlabeled; the label comes from the seam, never from the route.
 */
export function ownerContextRefusalLabel(): {
  demoOwnerContext: true;
  demoNote: string;
} {
  return DemoOwnerContext.label();
}

/**
 * DemoOwnerContext: the only OwnerContext implementation until real owner
 * auth exists. Tenant scoping comes from requireTenantContext (refused
 * before any I/O); the capability verdict comes from the seeded demo
 * chain (authentication alone never grants mutation); every label says
 * DEMO OWNER CONTEXT.
 */
export class DemoOwnerContext implements OwnerContext {
  private constructor(
    readonly tenantId: string,
    readonly actor: OwnerActorContext,
    private readonly chain: OwnerCorrectionChain,
  ) {}

  /**
   * Build the context for the tenant served by this request. The tenant
   * id is verified FIRST (fail closed); the demo chain is then resolved
   * for it. Throws TenantContextError on an invalid tenant; the caller
   * must still label that refusal via DemoOwnerContext.label().
   */
  static async forTenant(tenantId: string): Promise<DemoOwnerContext> {
    const verified = requireTenantContext({ tenantId });
    const chain = await resolveOwnerCorrectionChain(verified);
    const actor = demoActorContext(chain.actor.id, chain.actor.label);
    return new DemoOwnerContext(verified, actor, chain);
  }

  get disclosure(): string {
    return this.actor.disclosure;
  }

  /**
   * The demo label, usable even before a context exists (e.g. an invalid
   * tenant refusal): no response from this route may leave unlabeled.
   */
  static label(): { demoOwnerContext: true; demoNote: string } {
    return {
      demoOwnerContext: true as const,
      demoNote:
        "DEMO OWNER CONTEXT: mutations on this route run as a seeded demo " +
        "actor. No owner identity was verified. Not a production owner API.",
    };
  }

  responseLabel(): Record<string, unknown> {
    return DemoOwnerContext.label();
  }

  async evaluateCapability(
    _objectId: string,
    _capability: string,
  ): Promise<OwnerCapabilityEvaluation> {
    // Demo: the verdict comes from the seeded demo chain, which evaluates
    // owner.correct-fact for the seeded actor. The capability argument is
    // part of the interface for the future PING implementation; the demo
    // chain knows only owner.correct-fact.
    return {
      capability: this.chain.verdict.capability,
      allowed: this.chain.verdict.allowed,
      reason: this.chain.verdict.reason,
    };
  }

  capabilityImpactLine(evaluation: OwnerCapabilityEvaluation): string {
    return (
      "Capability " +
      evaluation.capability +
      ": " +
      (evaluation.allowed ? "ALLOWED" : "DENIED") +
      " under DEMO OWNER CONTEXT. " +
      evaluation.reason
    );
  }

  auditView(): Record<string, unknown> {
    return chainAuditView(this.chain);
  }
}
