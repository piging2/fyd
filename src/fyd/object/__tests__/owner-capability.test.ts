/**
 * Order C: the owner.correct-fact capability gate, as executable contract.
 *
 * Proves the SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP ->
 * CAPABILITY -> PROPOSE/APPLY -> EVENT -> PROJECTION chain on the pure
 * evaluation seam (src/fyd/owner-mode/capability.ts, demo-chain.ts):
 *
 * - the seeded demo actor resolves to a controller relationship;
 * - any other actor resolves to no relationship;
 * - owner.correct-fact is allowed for the controller and denied otherwise;
 * - deny is the default: every capability is denied without a controller
 *   relationship, and external effects (owner.publish) stay denied even
 *   for the controller;
 * - the audit view always carries the demo-scaffolding marker, so no
 *   demo verdict can be mistaken for verified ownership.
 *
 * The EVENT -> PROJECTION half (append-only log, byte-identical replay)
 * is proven in owner-events.test.ts; the 403-on-deny half is enforced by
 * the overrides route, which checks verdict.allowed before applying.
 */

jest.mock("@/lib/ping/session", () => ({
  getPracticeIdentityId: jest.fn(async () => null),
}));

import {
  DEMO_OWNER_ACTOR,
  evaluateAllCapabilities,
  evaluateCapability,
  listOwnerCapabilities,
  resolveDemoRelationship,
  type DemoActor,
} from "../../owner-mode/capability";
import {
  chainAuditView,
  resolveOwnerCorrectionChain,
} from "../../owner-mode/demo-chain";

const STRANGER: DemoActor = { id: "someone-else", label: "Stranger" };

describe("demo relationship mapping", () => {
  test("seeded demo actor is treated as controller", () => {
    const rel = resolveDemoRelationship("site-1", DEMO_OWNER_ACTOR);
    expect(rel.kind).toBe("controller");
    expect(rel.siteId).toBe("site-1");
    expect(rel.basis.length).toBeGreaterThan(0);
  });

  test("any other actor has no relationship", () => {
    const rel = resolveDemoRelationship("site-1", STRANGER);
    expect(rel.kind).toBe("none");
    expect(rel.siteId).toBe("site-1");
  });
});

describe("owner.correct-fact capability", () => {
  test("allowed for the controller relationship", () => {
    const rel = resolveDemoRelationship("site-1", DEMO_OWNER_ACTOR);
    const verdict = evaluateCapability(DEMO_OWNER_ACTOR, rel, "owner.correct-fact");
    expect(verdict.allowed).toBe(true);
    expect(verdict.capability).toBe("owner.correct-fact");
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  test("denied without a controller relationship: deny is the default", () => {
    const rel = resolveDemoRelationship("site-1", STRANGER);
    const verdict = evaluateCapability(STRANGER, rel, "owner.correct-fact");
    expect(verdict.allowed).toBe(false);
  });

  test("every capability is denied without a controller relationship", () => {
    const rel = resolveDemoRelationship("site-1", STRANGER);
    for (const cap of listOwnerCapabilities()) {
      expect(evaluateCapability(STRANGER, rel, cap).allowed).toBe(false);
    }
  });

  test("external effects stay denied even for the controller", () => {
    const rel = resolveDemoRelationship("site-1", DEMO_OWNER_ACTOR);
    expect(evaluateCapability(DEMO_OWNER_ACTOR, rel, "owner.publish").allowed).toBe(
      false
    );
  });

  test("evaluateAllCapabilities agrees with per-capability evaluation", () => {
    const rel = resolveDemoRelationship("site-1", DEMO_OWNER_ACTOR);
    const all = evaluateAllCapabilities(DEMO_OWNER_ACTOR, rel);
    expect(all.map((v) => v.capability).sort()).toEqual(
      listOwnerCapabilities().sort()
    );
    const byCap: Record<string, boolean> = Object.fromEntries(
      all.map((v) => [v.capability, v.allowed] as const)
    );
    expect(byCap["owner.correct-fact"]).toBe(true);
    expect(byCap["owner.publish"]).toBe(false);
  });
});

describe("chain resolution and audit labeling", () => {
  test("chain resolves with the demo actor and a verdict; session is audit-only", async () => {
    const chain = await resolveOwnerCorrectionChain("object-1");
    expect(chain.sessionIdentityId).toBeNull();
    expect(chain.actor.id).toBe(DEMO_OWNER_ACTOR.id);
    expect(chain.relationship.kind).toBe("controller");
    expect(chain.verdict.capability).toBe("owner.correct-fact");
    expect(chain.verdict.allowed).toBe(true);
    expect(chain.demoScaffolding).toBe(true);
    expect(chain.pingIdentityNote).toMatch(/grants nothing/);
  });

  test("audit view always carries the demo-scaffolding marker", async () => {
    const chain = await resolveOwnerCorrectionChain("object-1");
    const audit = chainAuditView(chain);
    expect(audit.demoScaffolding).toBe(true);
    expect(audit.actor.id).toBe(DEMO_OWNER_ACTOR.id);
    expect(audit.relationship.kind).toBe("controller");
    expect(audit.verdict).toMatchObject({
      capability: "owner.correct-fact",
      allowed: true,
    });
    expect(audit.auditNote).toMatch(/DEMO SCAFFOLDING/);
  });
});
