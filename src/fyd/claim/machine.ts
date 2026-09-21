/**
 * The claim state machine (onboarding order J). Pure transitions:
 * OBSERVED -> CLAIMED -> VERIFIED-CONTROLLED, with release() back to
 * OBSERVED. Every transition is immutable (returns a new record) and
 * appends an audit event. Invalid transitions throw ClaimError and change
 * nothing.
 */
import {
  ClaimError,
  type ClaimEventType,
  type ClaimedIdentity,
  type ResourceClaim,
  type VerificationProof,
} from "./types";
import { isVerificationMethodImplemented } from "./verification-seam";

/**
 * Demo/source-derived objects that can NEVER be claimed as owned.
 * The two demo businesses stay demo/testing context; claiming them would
 * manufacture ownership for the dogfood identity.
 */
export const DEMO_CONTEXT_IDS: ReadonlySet<string> = new Set([
  "happy-place",
  "coppersmith-plumbing",
]);

export function isValidResourceId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
}

function stamp(): string {
  return new Date().toISOString();
}

function withEvent(
  c: ResourceClaim,
  actor: string,
  type: ClaimEventType,
  detail: string,
): ResourceClaim {
  return {
    ...c,
    history: [...c.history, { at: stamp(), actor, type, detail }],
  };
}

/** Record public evidence with no ownership claim. */
export function createObserved(resourceId: string, sourceUrl?: string): ResourceClaim {
  if (!isValidResourceId(resourceId)) {
    throw new ClaimError("Invalid resource id.", "invalid-resource-id");
  }
  const now = stamp();
  return {
    version: 1,
    resourceId,
    kind: "fyd-site",
    state: "observed",
    sourceUrl: sourceUrl ?? null,
    observedAt: now,
    claimedBy: null,
    verification: null,
    history: [
      {
        at: now,
        actor: "system",
        type: "observed-created",
        detail:
          "Public evidence observed" +
          (sourceUrl ? " at " + sourceUrl : "") +
          ". No ownership claimed.",
      },
    ],
  };
}

/**
 * OBSERVED -> CLAIMED. Requires an authenticated identity; anonymous
 * callers (null) are refused. Demo-context objects are refused outright.
 */
export function claim(c: ResourceClaim, identity: ClaimedIdentity | null): ResourceClaim {
  if (!identity) {
    throw new ClaimError(
      "Claiming requires an authenticated identity. Anonymous previews cannot claim.",
      "identity-required",
    );
  }
  if (DEMO_CONTEXT_IDS.has(c.resourceId)) {
    throw new ClaimError(
      "Demo objects cannot be claimed: '" +
        c.resourceId +
        "' is a source-derived fixture in a labeled demo/testing context, not an ownable resource.",
      "demo-context",
    );
  }
  if (c.state !== "observed") {
    throw new ClaimError(
      "Only an observed (unclaimed) resource can be claimed; current state is " + c.state + ".",
      "bad-transition",
    );
  }
  return withEvent(
    { ...c, state: "claimed", claimedBy: identity },
    identity.actorLabel,
    "claimed",
    "Control asserted by " + identity.actorLabel + " (" + identity.kind + "). " + identity.authNote,
  );
}

/**
 * CLAIMED -> VERIFIED-CONTROLLED. Requires a proof from an implemented
 * verification method with a real human-readable basis.
 */
export function verifyControl(c: ResourceClaim, proof: VerificationProof): ResourceClaim {
  if (c.state !== "claimed") {
    throw new ClaimError(
      "Only a claimed resource can move to verified-controlled; current state is " +
        c.state +
        ".",
      "bad-transition",
    );
  }
  if (!c.claimedBy) {
    throw new ClaimError("Claimed state without an identity is corrupt; refusing.", "corrupt");
  }
  if (!isVerificationMethodImplemented(proof.method)) {
    throw new ClaimError(
      "Verification method '" + proof.method + "' is not implemented yet.",
      "method-unimplemented",
    );
  }
  if (!proof.basis || proof.basis.trim().length < 10) {
    throw new ClaimError(
      "A verification proof needs a human-readable basis (at least 10 characters).",
      "weak-proof",
    );
  }
  return withEvent(
    { ...c, state: "verified-controlled", verification: proof },
    proof.verifiedBy,
    "verified",
    "Control verified via " + proof.method + ". " + proof.proofNote,
  );
}

/** Audit a verification attempt without changing state (e.g. a failed try). */
export function recordVerifyAttempt(
  c: ResourceClaim,
  actor: string,
  detail: string,
): ResourceClaim {
  return withEvent(c, actor, "verify-attempt", detail);
}

/**
 * CLAIMED or VERIFIED-CONTROLLED -> OBSERVED. Clears identity and proof;
 * the audit history is preserved. Only the claiming identity or an
 * operator should call this; the API route enforces that.
 */
export function release(c: ResourceClaim, actorLabel: string): ResourceClaim {
  if (c.state === "observed") {
    throw new ClaimError("Nothing to release: the resource is already unclaimed.", "bad-transition");
  }
  return withEvent(
    { ...c, state: "observed", claimedBy: null, verification: null },
    actorLabel,
    "released",
    "Claim released by " + actorLabel + "; resource returns to observed (public evidence only).",
  );
}
