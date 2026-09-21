/**
 * Identity bridge for the claim flow (onboarding order J).
 *
 * Demo-owner mode is the ONLY identity source in this build. The auth lane
 * is building the real Google-ready adapter in parallel (src/fyd/identity);
 * this bridge deliberately does NOT depend on it. When that adapter lands,
 * it adds a new ClaimedIdentity kind here; the state machine is unchanged.
 *
 * Returns null when no authenticated identity is available. Callers must
 * fail closed on null, never invent an identity.
 */
import { DEMO_OWNER_ACTOR } from "../owner-mode/capability";
import { isDemoOwnerModeEnabled } from "../owner-mode/gate";
import type { ClaimedIdentity } from "./types";

export function resolveClaimIdentity(): ClaimedIdentity | null {
  if (!isDemoOwnerModeEnabled()) return null;
  return {
    kind: "demo-owner",
    actorId: DEMO_OWNER_ACTOR.id,
    actorLabel: DEMO_OWNER_ACTOR.label,
    authenticatedAt: new Date().toISOString(),
    authNote:
      "DEMO OWNER MODE - not real authentication. No identity was verified; " +
      "this claim is labeled demo, audited, and confers no production ownership.",
  };
}
