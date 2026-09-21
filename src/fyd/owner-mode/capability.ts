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
  | "owner.customize-approve";

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
  }
}

/** Evaluate every known capability for an actor/relationship pair. */
export function evaluateAllCapabilities(
  actor: DemoActor,
  relationship: OwnerRelationship,
): CapabilityVerdict[] {
  return ALL_CAPABILITIES.map((c) => evaluateCapability(actor, relationship, c));
}
