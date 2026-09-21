/**
 * H3 lane: the SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP ->
 * CAPABILITY chain for owner fact corrections. DEMO SCAFFOLDING.
 *
 * The chain, in order, with nothing hidden:
 *
 *   1. SESSION: the practice identity cookie (getPracticeIdentityId).
 *      Recorded for audit only.
 *   2. PING IDENTITY: the dev identity id behind the session. A dev
 *      identity, never a verified real-world identity.
 *   3. CONTROL RELATIONSHIP: the demo mapping (resolveDemoRelationship)
 *      treats the SEEDED DEMO ACTOR as controller. This mapping is the
 *      demo: it is keyed on the seeded actor id, NOT on the session
 *      identity. Authentication alone NEVER grants mutation; a session
 *      identity by itself authorizes nothing.
 *   4. CAPABILITY: evaluateCapability(actor, relationship,
 *      "owner.correct-fact"). Deny is the default; the allow fires only
 *      for the controller relationship under the demo mapping.
 *   5. PROPOSE/APPLY RULE: enforced by the caller (the overrides route's
 *      propose/approve two-step). The caller must check verdict.allowed
 *      BEFORE applying; approve appends the event, and the read model
 *      re-projects from the log (EVENT -> PROJECTION).
 *
 * THIS IS NOT AUTHENTICATION. See ./gate.ts. Nothing here may back a
 * production authorization decision. Production owner auth must be built
 * as a separate, reviewed mechanism; these demo verdicts must not be
 * reused, wrapped, or "upgraded".
 *
 * SERVER ONLY: reads the session cookie via next/headers.
 */

import { getPracticeIdentityId } from "@/lib/ping/session";
import {
  DEMO_OWNER_ACTOR,
  evaluateCapability,
  resolveDemoRelationship,
  type CapabilityVerdict,
  type DemoActor,
  type OwnerRelationship,
} from "./capability";

export interface OwnerCorrectionChain {
  /** The practice session's identity id, or null when no session. */
  sessionIdentityId: string | null;
  /**
   * What the session identity does and does not mean. Informational;
   * the verdict below never derives from it.
   */
  pingIdentityNote: string;
  /** Always the seeded demo actor in this lane. A label, not an identity. */
  actor: DemoActor;
  relationship: OwnerRelationship;
  verdict: CapabilityVerdict;
  /** Always true: marks this chain as demo scaffolding in audit trails. */
  demoScaffolding: true;
  auditNote: string;
}

/**
 * Resolve the full chain for an owner.correct-fact attempt on one object.
 * Pure evaluation: performs no mutation and writes nothing.
 */
export async function resolveOwnerCorrectionChain(
  objectId: string,
): Promise<OwnerCorrectionChain> {
  let sessionIdentityId: string | null = null;
  try {
    sessionIdentityId = await getPracticeIdentityId();
  } catch {
    sessionIdentityId = null;
  }

  // The demo shortcut, stated plainly: whichever dev identity (if any)
  // sits behind the session, the actor recorded on events is the seeded
  // demo actor. The session identity grants nothing; the allow/deny comes
  // from the demo relationship mapping plus the capability rule.
  const actor = DEMO_OWNER_ACTOR;
  const relationship = resolveDemoRelationship(objectId, actor);
  const verdict = evaluateCapability(actor, relationship, "owner.correct-fact");

  return {
    sessionIdentityId,
    pingIdentityNote:
      "demo scaffolding: the practice session identity is recorded for " +
      "audit only. It is a dev identity, never a verified owner, and it " +
      "grants nothing by itself; authentication alone never authorizes a " +
      "mutation. The verdict below derives from the demo relationship " +
      "mapping plus the capability rule.",
    actor,
    relationship,
    verdict,
    demoScaffolding: true,
    auditNote:
      "DEMO SCAFFOLDING: the seeded demo actor '" +
      actor.id +
      "' is treated as controller of '" +
      objectId +
      "' by a hard-coded demo mapping. No identity was verified. Nothing " +
      "in this chain may back a production authorization decision.",
  };
}

/** JSON-safe audit view of a resolved chain, for route responses/logs. */
export function chainAuditView(chain: OwnerCorrectionChain): {
  demoScaffolding: true;
  sessionIdentityId: string | null;
  actor: { id: string; label: string };
  relationship: { kind: OwnerRelationship["kind"]; basis: string };
  verdict: { capability: string; allowed: boolean; reason: string };
  auditNote: string;
} {
  return {
    demoScaffolding: true,
    sessionIdentityId: chain.sessionIdentityId,
    actor: { id: chain.actor.id, label: chain.actor.label },
    relationship: {
      kind: chain.relationship.kind,
      basis: chain.relationship.basis,
    },
    verdict: {
      capability: chain.verdict.capability,
      allowed: chain.verdict.allowed,
      reason: chain.verdict.reason,
    },
    auditNote: chain.auditNote,
  };
}
