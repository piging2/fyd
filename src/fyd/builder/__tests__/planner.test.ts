/**
 * The site planner: semantic determinism, the confidence law, owner-intent
 * honoring, eligibility filtering, and manifest walks.
 */
import { planSite, SITE_PLANNER_VERSION } from "../planner";
import { COPPERSMITH_VECTOR, PING_DOGFOOD_VECTOR } from "../dimensions";
import { knowledgeGraph, tradeGraph } from "./fixtures";
import { validateSiteSpec } from "../../sitespec/validator";

const CTX = { tenantId: "trade-tenant" };
const STAMP_A = "2026-09-21T12:00:00.000Z";
const STAMP_B = "2026-09-22T03:14:15.926Z";

describe("planSite", () => {
  test("same inputs -> same semantic spec, byte for byte", () => {
    const a = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    const b = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
    expect(a.semanticDigest).toBe(b.semanticDigest);
    expect(a.canonicalSpecJson).toBe(b.canonicalSpecJson);
  });

  test("volatile stamps never enter the semantic digest", () => {
    const a = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    const b = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_B });
    expect(a.semanticDigest).toBe(b.semanticDigest);
    expect(a.canonicalSpecJson).toBe(b.canonicalSpecJson);
    expect(a.spec.generator.generatedAt).toBe(STAMP_A);
    expect(b.spec.generator.generatedAt).toBe(STAMP_B);
  });

  test("different vectors -> different plans (composition actually matters)", () => {
    const a = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    const b = planSite({ ctx: CTX, graph: tradeGraph(), vector: PING_DOGFOOD_VECTOR, generatedAt: STAMP_A });
    expect(a.semanticDigest).not.toBe(b.semanticDigest);
  });

  test("the planner never manufactures facts: no ungrounded sections", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR });
    const components = planned.spec.pages.flatMap((p) => p.sections.map((s) => s.component));
    for (const c of components) {
      expect(planned.eligibility.eligible[c]).toBe(true);
    }
    // Trade graph has no reviews: SocialProof must never appear.
    expect(components).not.toContain("SocialProof");
    expect(components).toContain("Services");
    expect(components).toContain("Hero");
  });

  test("planned spec validates against the SiteSpec schema", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR });
    expect(() => validateSiteSpec(planned.spec)).not.toThrow();
  });

  test("confidence law holds: presentationConfidence <= factConfidence everywhere", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR });
    for (const c of planned.confidence) {
      expect(c.presentationConfidence).toBeLessThanOrEqual(c.factConfidence);
    }
    for (const b of planned.manifest.bindings) {
      expect(b.presentationConfidence).toBeLessThanOrEqual(b.factConfidence);
    }
  });

  test("prohibited positioning is honored in generated copy", () => {
    const planned = planSite({
      ctx: CTX,
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      ownerIntent: { prohibitedPositioning: ["valley"] },
    });
    // "valley" appears in the business description; the generated tagline
    // must not inherit it. (Here the tagline binds title+locality only.)
    for (const slot of planned.generatedPresentation.slots) {
      expect(slot.text.toLowerCase()).not.toContain("valley");
    }
  });

  test("operating constraints remove components and record the removal", () => {
    const planned = planSite({
      ctx: CTX,
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      ownerIntent: { operatingConstraints: ["no-posts"] },
    });
    const components = planned.spec.pages.flatMap((p) => p.sections.map((s) => s.component));
    expect(components).not.toContain("RecentObjects");
    expect(components).not.toContain("ObjectFeed");
    expect(
      planned.manifest.notes.some((n) => n.includes("removed by operating constraint")),
    ).toBe(true);
  });

  test("unknown operating constraints are recorded, never applied", () => {
    const planned = planSite({
      ctx: CTX,
      graph: tradeGraph(),
      vector: COPPERSMITH_VECTOR,
      ownerIntent: { operatingConstraints: ["no-singing-in-the-shower"] },
    });
    const components = planned.spec.pages.flatMap((p) => p.sections.map((s) => s.component));
    // Nothing was removed by the unknown constraint.
    expect(components).toContain("Services");
    expect(
      planned.manifest.notes.some((n) => n.includes("no-singing-in-the-shower")),
    ).toBe(true);
  });

  test("empty owner intent equals current behavior", () => {
    const withEmpty = planSite({
      ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR,
      ownerIntent: {}, generatedAt: STAMP_A,
    });
    const without = planSite({
      ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR,
      generatedAt: STAMP_A,
    });
    expect(withEmpty.canonicalSpecJson).toBe(without.canonicalSpecJson);
    expect(withEmpty.semanticDigest).toBe(without.semanticDigest);
  });

  test("manifest forward/reverse walks cover every binding", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR });
    const sections = planned.spec.pages.flatMap((p) => p.sections.map((s) => s.id));
    expect(planned.manifest.bindings.map((b) => b.bindingId).sort()).toEqual(sections.sort());
    // Every binding walks forward to its component and reverse to an object field.
    for (const b of planned.manifest.bindings) {
      expect(b.component).toBeTruthy();
      expect(b.objectField).toBeTruthy();
      expect(b.claimRef).not.toBeNull();
    }
  });

  test("planner version is stamped on the spec and manifest", () => {
    const planned = planSite({ ctx: CTX, graph: knowledgeGraph(), vector: PING_DOGFOOD_VECTOR });
    expect(planned.spec.generator.name).toBe("fyd-site-generator");
    expect(planned.spec.generator.version).toBe(SITE_PLANNER_VERSION);
    expect(planned.manifest.plannerVersion).toBe(SITE_PLANNER_VERSION);
    expect(planned.plannerVersion).toBe(SITE_PLANNER_VERSION);
  });

  test("missing tenant context refuses before any planning", () => {
    try {
      planSite({ ctx: {} as never, graph: tradeGraph(), vector: COPPERSMITH_VECTOR });
      throw new Error("planSite did not refuse");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("TENANT_CONTEXT_MISSING");
    }
  });
});
