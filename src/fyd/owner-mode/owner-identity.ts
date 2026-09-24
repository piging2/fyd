/**
 * LANE-OWNER: the owner identity seam.
 *
 * Where real authentication binds identity to owner capabilities.
 *
 * The seam is an interface, not fake auth:
 *
 *   OwnerIdentityProvider   anything that can resolve "who is asking"
 *                           into an OwnerIdentity. Production auth
 *                           implements this interface and calls
 *                           bindIdentityProvider() once at server startup.
 *   DemoIdentityProvider    the demo implementation. It resolves to an
 *                           EXPLICITLY UNVERIFIED identity (verified:
 *                           false). It exists so the demo can show the
 *                           seam; it proves nothing and must never back a
 *                           production authorization decision.
 *
 * Rules, frozen:
 * - The default bound provider is the demo one. Until production binds a
 *   real provider, every resolved identity is unverified and every
 *   consumer must treat it as such.
 * - Nothing in the demo chain (see ./capability.ts, ./demo-chain.ts)
 *   derives authority from the identity: the demo allow/deny comes from
 *   the hard-coded relationship mapping plus the capability rules.
 *   Authentication alone never authorizes a mutation.
 * - A production provider must return verified: true only after a real
 *   verification step the demo does not perform (session check, signature,
 *   SSO, or whatever the business chooses). The interface does not
 *   prescribe the mechanism; it prescribes the honesty: verified means
 *   verified.
 *
 * Pure except for the module-level binding, which is the seam itself.
 * Browser-safe.
 */

/** Who is asking, and whether anyone actually checked. */
export interface OwnerIdentity {
  /** Stable id for the identity within its provider's namespace. */
  identityId: string;
  /**
   * True ONLY when the provider performed a real verification step.
   * The demo provider always returns false.
   */
  verified: boolean;
  /** How the identity was established, e.g. "demo-seeded", "sso". */
  method: string;
  /** Human-readable note about what verification did or did not happen. */
  note: string;
}

/**
 * The production binding point. Implement this interface with the real
 * auth mechanism and register it via bindIdentityProvider(). The demo
 * never implements this beyond the explicitly-unverified demo below.
 */
export interface OwnerIdentityProvider {
  /** Provider name for audit trails, e.g. "demo-seeded", "ping-sso". */
  readonly name: string;
  /**
   * Resolve the current caller's owner identity, or null when there is
   * no caller identity to resolve (anonymous). Implementations must not
   * throw for the anonymous case; they return null.
   */
  resolveIdentity(): Promise<OwnerIdentity | null>;
}

/**
 * DEMO ONLY. Resolves to the seeded demo actor with verified: false.
 * The note says exactly what did not happen. Nothing here may be
 * consulted for a real authorization decision.
 */
export class DemoIdentityProvider implements OwnerIdentityProvider {
  readonly name = "demo-seeded (unverified)";

  async resolveIdentity(): Promise<OwnerIdentity> {
    return {
      identityId: "demo-owner",
      verified: false,
      method: "demo-seeded",
      note:
        "DEMO ONLY: no identity was verified. The seeded demo actor is a " +
        "label, not a person. Production must bind a real provider via " +
        "bindIdentityProvider() before any owner capability is trusted.",
    };
  }
}

let bound: OwnerIdentityProvider = new DemoIdentityProvider();

/**
 * THE SEAM: production calls this once at startup with its real
 * OwnerIdentityProvider. Until then (and in every demo), the demo
 * provider stays bound and every identity resolves unverified.
 */
export function bindIdentityProvider(provider: OwnerIdentityProvider): void {
  bound = provider;
}

/** The currently bound provider. The demo default is unverified by design. */
export function identityProvider(): OwnerIdentityProvider {
  return bound;
}

/** Resolve the caller's owner identity through the bound provider. */
export function resolveOwnerIdentity(): Promise<OwnerIdentity | null> {
  return bound.resolveIdentity();
}

/**
 * Fail-closed helper for callers: true only when a verified owner identity
 * resolved. The demo provider can never return true.
 */
export async function hasVerifiedOwner(): Promise<boolean> {
  const identity = await resolveOwnerIdentity();
  return identity !== null && identity.verified === true;
}
