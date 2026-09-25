/**
 * H3 lane: the explicit owner-action seam for DEMO OWNER MODE.
 *
 * The seam, in order, with nothing hidden:
 *
 *   1. ACTOR: a demo label (see DemoActor). Not a verified identity.
 *   2. RELATIONSHIP: resolveDemoRelationship maps the actor to an owner /
 *      controller relationship for a site. The mapping is hard-coded and
 *      visible below; it proves nothing about the real world.
 *   3. CAPABILITY EVALUATION: evaluateCapability answers "may this actor
 *      perform this operation on this site?" with an allow/deny verdict
 *      plus a human-readable reason. Deny is the default; allow is granted
 *      only by the rules below.
 *   4. OPERATION: the caller must check verdict.allowed BEFORE acting, and
 *      owner attestations additionally pass the attestation gate
 *      (./attestation-gate.ts), which rejects on missing evidence.
 *
 * THIS IS NOT AUTHENTICATION. See ./gate.ts. Every verdict carries its
 * reason so a reviewer can see exactly why an action was permitted in the
 * demo. Nothing here may back a production authorization decision.
 */

import type { OwnerIdentity } from "./owner-identity";

/** A demo actor: a label, not an identity. */
export interface DemoActor {
  id: string;
  label: string;
}

/**
 * The relationship the demo grants an actor to a site.
 * "controller" mirrors the object-graph controllerId concept; in the demo
 * it is assigned by the mapping below, not discovered or verified.
 */
export interface OwnerRelationship {
  siteId: string;
  kind: "controller" | "none";
  /** Human-readable basis for the assignment. Always explicit. */
  basis: string;
}

/** Operations the demo owner panel can attempt. */
export type OwnerCapability =
  | "owner.attest-regen"
  | "owner.edit-visibility"
  | "owner.publish"
  | "owner.customize-approve"
  | "owner.correct-fact";

export interface CapabilityVerdict {
  capability: OwnerCapability;
  allowed: boolean;
  /** Typed human reason, e.g. "demo: controller may attest". */
  reason: string;
  actorId: string;
  relationshipKind: OwnerRelationship["kind"];
}

/** The one seeded demo actor the panel offers. */
export const DEMO_OWNER_ACTOR: DemoActor = {
  id: "demo-owner",
  label: "Demo Owner (seeded, unverified)",
};

/**
 * Demo relationship mapping. Explicit and total:
 * - the seeded demo actor is treated as controller of every demo site;
 * - any other actor id has no relationship to any site.
 * This mapping is the demo. It verifies nothing.
 */
export function resolveDemoRelationship(
  siteId: string,
  actor: DemoActor,
): OwnerRelationship {
  if (actor.id === DEMO_OWNER_ACTOR.id) {
    return {
      siteId,
      kind: "controller",
      basis:
        "demo mapping: the seeded demo actor is treated as the site " +
        "controller. No identity was verified.",
    };
  }
  return {
    siteId,
    kind: "none",
    basis:
      "demo mapping: actor '" +
      actor.id +
      "' is not the seeded demo actor, so it holds no demo relationship.",
  };
}

const ALL_CAPABILITIES: OwnerCapability[] = [
  "owner.attest-regen",
  "owner.edit-visibility",
  "owner.publish",
  "owner.customize-approve",
  "owner.correct-fact",
];

export function listOwnerCapabilities(): OwnerCapability[] {
  return ALL_CAPABILITIES.slice();
}

/**
 * Evaluate one capability. Deny-by-default; allow only by the rules below.
 * The verdict reason always names the rule that fired.
 */
export function evaluateCapability(
  actor: DemoActor,
  relationship: OwnerRelationship,
  capability: OwnerCapability,
): CapabilityVerdict {
  const base = {
    capability,
    actorId: actor.id,
    relationshipKind: relationship.kind,
  };
  if (relationship.kind !== "controller") {
    return {
      ...base,
      allowed: false,
      reason:
        "demo: deny " +
        capability +
        " - actor has no controller relationship to site '" +
        relationship.siteId +
        "' (" +
        relationship.basis +
        ")",
    };
  }
  switch (capability) {
    case "owner.attest-regen":
      return {
        ...base,
        allowed: true,
        reason:
          "demo: allow - controller may attest regen outcomes; the " +
          "attestation gate still rejects on missing evidence.",
      };
    case "owner.edit-visibility":
      return {
        ...base,
        allowed: true,
        reason:
          "demo: allow - controller may propose field-visibility edits " +
          "(proposal only; nothing is persisted by this demo).",
      };
    case "owner.publish":
      return {
        ...base,
        allowed: false,
        reason:
          "demo: deny - the demo grants no publish path; publishing would " +
          "be a real-world effect and this demo performs none.",
      };
    case "owner.customize-approve":
      return {
        ...base,
        allowed: true,
        reason:
          "demo: allow - controller may approve a digest-bound " +
          "presentation-intent proposal. Approval only journals a " +
          "presentation-intent overlay for the demo journal; facts are " +
          "untouched and the approval itself carries the " +
          "\"DEMO OWNER MODE - not real authentication\" marker.",
      };
    case "owner.correct-fact":
      // Low-risk owner corrections stay streamlined: contact-field
      // corrections, service order/visibility, and address visibility.
      // Each correction is journaled as a provenance-backed event and the
      // source record is never rewritten, so the allow is bounded to
      // facts. External effects (publish, message, purchase) stay on
      // their own capabilities and remain deny-by-default.
      return {
        ...base,
        allowed: true,
        reason:
          "demo: allow - controller may correct low-risk facts; every " +
          "correction is journaled as a provenance-backed event with the " +
          "source value preserved, and source state is never rewritten. " +
          "External effects remain on their own denied capabilities.",
      };
  }
}

/** Evaluate every known capability for an actor/relationship pair. */
export function evaluateAllCapabilities(
  actor: DemoActor,
  relationship: OwnerRelationship,
): CapabilityVerdict[] {
  return ALL_CAPABILITIES.map((c) => evaluateCapability(actor, relationship, c));
}

/**
 * TRACK B (2026-09-25, FYD product authority directive): the narrow typed
 * authorization seam.
 *
 * The UI never decides authorization. It asks one question:
 *
 *   CAN THIS ACTOR PERFORM THIS ACTION ON THIS OBJECT?
 *
 * and an authority answers. The question shape is fixed and narrow:
 *
 *   ACTOR               who is asking (a label in demo; a verified identity
 *                       reference under real auth)
 *   IDENTITY            what identity was established, and whether anyone
 *                       actually verified it (OwnerIdentity.verified)
 *   OWNERSHIP/CONTROL   the control relationship the authority asserts
 *                       between actor and resource
 *   CAPABILITY          the capability class of the requested action
 *   RESOURCE            the object/site the action targets
 *   ACTION              the verb on that resource
 *
 * Demo mode temporarily supplies the actor/control assertion (the
 * hard-coded demo mapping); the identity it supplies is explicitly
 * unverified. A production implementation answers the SAME question shape
 * from verified identity + verified control: the seam survives replacement
 * because the question does not depend on demo specifics.
 *
 * This is NOT a new authority: demoAuthorizationAuthority delegates to
 * evaluateCapability above, which remains the single demo authority.
 * Production binds its own AuthorizationAuthority (same signature) where
 * the demo one is bound today.
 */

/** The single question the UI asks the authority. */
export interface AuthorizationQuestion {
  /** ACTOR: who is asking. A label, not an identity, in demo. */
  actor: DemoActor;
  /**
   * IDENTITY: what identity the bound provider resolved, and whether it
   * was verified. Demo: the demo provider, verified: false, always.
   */
  identity: OwnerIdentity | null;
  /** OWNERSHIP/CONTROL: the control relationship asserted for this ask. */
  control: OwnerRelationship;
  /** CAPABILITY: the capability class of the requested action. */
  capability: OwnerCapability;
  /** RESOURCE: the object/site the action targets. */
  resource: { siteId: string; objectId?: string };
  /** ACTION: the verb on the resource, e.g. "approve", "hide", "show". */
  action: string;
}

/** The authority's answer. Never a bare boolean: the reason and the demo
 *  marker travel with every verdict. */
export interface AuthorizationAnswer extends CapabilityVerdict {
  /**
   * Always true for answers through this demo seam: marks the answer as
   * non-production authorization in every audit trail.
   */
  demoScaffolding: true;
  /**
   * What the identity did and did not establish. Demo: "unverified".
   */
  identityNote: string;
}

/**
 * An authority that answers AuthorizationQuestions. The demo authority
 * below implements it over evaluateCapability; a production authority
 * implements the same signature from verified identity + verified control.
 */
export type AuthorizationAuthority = (
  question: AuthorizationQuestion,
) => AuthorizationAnswer;

/**
 * The demo authority. Supplies the demo actor/control assertion and
 * delegates the allow/deny to evaluateCapability (the single demo
 * authority). The answer is always stamped demoScaffolding: true and the
 * identity note always says unverified.
 */
export const demoAuthorizationAuthority: AuthorizationAuthority = (
  question,
) => {
  const verdict = evaluateCapability(
    question.actor,
    question.control,
    question.capability,
  );
  return {
    ...verdict,
    demoScaffolding: true as const,
    identityNote:
      question.identity === null
        ? "demo: no identity resolved (anonymous under the demo provider)."
        : "demo: identity '" +
          question.identity.identityId +
          "' via '" +
          question.identity.method +
          "'; verified=" +
          String(question.identity.verified) +
          " (the demo provider never verifies).",
  };
};

/**
 * Ask the authority. Defaults to the demo authority; production passes its
 * own AuthorizationAuthority. The question shape is identical either way,
 * which is what makes the seam survive the replacement.
 */
export function answerAuthorization(
  question: AuthorizationQuestion,
  authority: AuthorizationAuthority = demoAuthorizationAuthority,
): AuthorizationAnswer {
  return authority(question);
}

/**
 * Build the demo AuthorizationQuestion for an actor on a site. The
 * control assertion comes from the hard-coded demo mapping
 * (resolveDemoRelationship): it verifies nothing. The identity comes from
 * the bound identity provider (the demo provider resolves unverified).
 */
export function demoAuthorizationQuestion(
  actor: DemoActor,
  siteId: string,
  capability: OwnerCapability,
  action: string,
  identity: OwnerIdentity | null,
  objectId?: string,
): AuthorizationQuestion {
  return {
    actor,
    identity,
    control: resolveDemoRelationship(siteId, actor),
    capability,
    resource: objectId === undefined ? { siteId } : { siteId, objectId },
    action,
  };
}
