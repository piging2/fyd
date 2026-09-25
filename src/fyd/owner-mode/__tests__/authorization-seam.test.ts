/**
 * TRACK B (2026-09-25, FYD product authority directive, Nolan): the narrow
 * typed authorization seam.
 *
 * The UI asks one question (ACTOR / IDENTITY / OWNERSHIP-CONTROL /
 * CAPABILITY / RESOURCE / ACTION); an authority answers. This test pins:
 *
 * - the question carries all six elements, none defaulted;
 * - the demo authority delegates to the single demo capability authority
 *   (evaluateCapability), so the CAPABILITY and the RESOURCE are actually
 *   consulted (regression for the ignored-arguments seam defect);
 * - every demo answer is stamped demoScaffolding: true with an identity
 *   note that says unverified (never "authenticated owner");
 * - the seam survives authority replacement: a different
 *   AuthorizationAuthority answers the SAME question shape.
 */

import {
  answerAuthorization,
  DEMO_OWNER_ACTOR,
  demoAuthorizationAuthority,
  demoAuthorizationQuestion,
  resolveDemoRelationship,
  type AuthorizationAnswer,
  type AuthorizationAuthority,
  type AuthorizationQuestion,
} from "../capability";
import type { OwnerIdentity } from "../owner-identity";

const DEMO_IDENTITY: OwnerIdentity = {
  identityId: "demo-owner",
  method: "demo-seeded",
  verified: false,
  note: "Seeded for demo only. Not verified.",
};

function question(
  capability: "owner.correct-fact" | "owner.publish",
  siteId = "happy-place",
): AuthorizationQuestion {
  return demoAuthorizationQuestion(
    DEMO_OWNER_ACTOR,
    siteId,
    capability,
    capability === "owner.publish" ? "publish" : "correct",
    DEMO_IDENTITY,
  );
}

describe("authorization seam", () => {
  test("the question carries actor, identity, control, capability, resource, action", () => {
    const q = question("owner.correct-fact", "happy-place");
    expect(q.actor).toBe(DEMO_OWNER_ACTOR);
    expect(q.identity).toBe(DEMO_IDENTITY);
    expect(q.control).toEqual(resolveDemoRelationship("happy-place", DEMO_OWNER_ACTOR));
    expect(q.control.kind).toBe("controller");
    expect(q.capability).toBe("owner.correct-fact");
    expect(q.resource).toEqual({ siteId: "happy-place" });
    expect(q.action).toBe("correct");
  });

  test("the demo authority consults the capability: publish is denied, correct-fact allowed", () => {
    const denied = answerAuthorization(question("owner.publish"));
    expect(denied.allowed).toBe(false);
    expect(denied.capability).toBe("owner.publish");
    expect(denied.reason).toMatch(/demo: deny/);

    const allowed = answerAuthorization(question("owner.correct-fact"));
    expect(allowed.allowed).toBe(true);
    expect(allowed.capability).toBe("owner.correct-fact");
  });

  test("the demo authority consults the resource: a stranger actor has no control relationship", () => {
    const stranger = { id: "stranger", label: "Stranger" };
    const q = demoAuthorizationQuestion(
      stranger,
      "happy-place",
      "owner.correct-fact",
      "correct",
      null,
    );
    expect(q.control.kind).toBe("none");
    const answer = answerAuthorization(q);
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toMatch(/no controller relationship/);
  });

  test("every demo answer is stamped demo scaffolding with an unverified identity note", () => {
    const answer = answerAuthorization(question("owner.correct-fact"));
    expect(answer.demoScaffolding).toBe(true);
    expect(answer.identityNote).toMatch(/verified=false/);
    expect(answer.identityNote).toMatch(/never verifies/);
    // Never "authenticated owner".
    expect(answer.identityNote.toLowerCase()).not.toContain("authenticated");
  });

  test("the seam survives replacement: a custom authority answers the same question shape", () => {
    const strict: AuthorizationAuthority = (q) => {
      const base = demoAuthorizationAuthority(q);
      // Production-shaped rule: verified identity required, always.
      if (q.identity === null || q.identity.verified !== true) {
        const denied: AuthorizationAnswer = {
          ...base,
          allowed: false,
          reason: "strict: deny - no verified identity.",
          identityNote: "strict: identity missing or unverified.",
        };
        return denied;
      }
      return base;
    };
    const q = question("owner.correct-fact");
    // Same question shape in, typed answer out.
    const answer = answerAuthorization(q, strict);
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toMatch(/strict: deny/);
    expect(answer.capability).toBe("owner.correct-fact");
    expect(answer.demoScaffolding).toBe(true);
  });
});
