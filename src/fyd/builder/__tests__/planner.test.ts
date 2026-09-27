/**
 * The site planner: semantic determinism, the confidence law, owner-intent
 * honoring, eligibility filtering, and manifest walks.
 */
import { planSite, resolveQueryObjects, SITE_PLANNER_VERSION } from "../planner";
import { COPPERSMITH_VECTOR, PING_DOGFOOD_VECTOR } from "../dimensions";
import { knowledgeGraph, makeObject, makeRelationship, tradeGraph } from "./fixtures";
import { validateSiteSpec } from "../../sitespec/validator";
import { diffSiteSpecs } from "../structural-diff";
import type { ObjectGraph } from "../../sitespec/types";

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
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    const components = planned.spec.pages.flatMap((p) => p.sections.map((s) => s.component));
    for (const c of components) {
      expect(planned.eligibility.eligible[c]).toBe(true);
    }
    // Trade graph has no reviews: SocialProof must never appear.
    expect(components).not.toContain("SocialProof");
    expect(components).toContain("Services");
    expect(components).toContain("Hero");
  });

  test("CTA and ObjectRail are planned on the trade-graph home page", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    const home = planned.spec.pages.find((p) => p.slug === "home")!;
    const components = home.sections.map((s) => s.component);
    // CTA is a site capability: on every generated home page.
    expect(components).toContain("CTA");
    expect(planned.eligibility.eligible["CTA"]).toBe(true);
    // ObjectRail: the trade graph has featureable services/people/posts,
    // so the inline circle doorway is planned and eligible.
    expect(components).toContain("ObjectRail");
    expect(planned.eligibility.eligible["ObjectRail"]).toBe(true);
    const rail = home.sections.find((s) => s.component === "ObjectRail")!;
    // The doorway resolves its objects from the live graph: a deterministic
    // related query over the eligible predicates/schemas, never invented ids.
    expect(rail.query.kind).toBe("related");
    if (rail.query.kind === "related") {
      expect(rail.query.from).toBe("biz-trade");
      // Direction-agnostic predicate vocabulary in canonical role order
      // (service, product, person, post, article): forward predicates
      // first, then their inverses. The section query carries the whole
      // vocabulary so the planner binds members on either edge direction.
      expect(rail.query.predicates).toEqual([
        "provides",
        "offers",
        "provided_by",
        "employs",
        "has_member",
        "has_employee",
        "works_for",
        "member_of",
        "publishes",
        "published_by",
      ]);
      expect(rail.query.schemas).toEqual(
        expect.arrayContaining(["ping.social.service@1"]),
      );
      expect(rail.query.limit).toBe(6);
    }
    // ObjectRail keeps its registered order: after AskFYD.
    expect(components.indexOf("ObjectRail")).toBeGreaterThan(
      components.indexOf("AskFYD"),
    );
  });

  test("planned spec validates against the SiteSpec schema", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    expect(() => validateSiteSpec(planned.spec)).not.toThrow();
  });

  test("confidence law holds: presentationConfidence <= factConfidence everywhere", () => {
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
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
      generatedAt: STAMP_A,
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
      generatedAt: STAMP_A,
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
      generatedAt: STAMP_A,
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
    const planned = planSite({ ctx: CTX, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
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
    const planned = planSite({ ctx: CTX, graph: knowledgeGraph(), vector: PING_DOGFOOD_VECTOR, generatedAt: STAMP_A });
    expect(planned.spec.generator.name).toBe("fyd-site-generator");
    expect(planned.spec.generator.version).toBe(SITE_PLANNER_VERSION);
    expect(planned.manifest.plannerVersion).toBe(SITE_PLANNER_VERSION);
    expect(planned.plannerVersion).toBe(SITE_PLANNER_VERSION);
  });

  test("missing tenant context refuses before any planning", () => {
    try {
      planSite({ ctx: {} as never, graph: tradeGraph(), vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
      throw new Error("planSite did not refuse");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("TENANT_CONTEXT_MISSING");
    }
  });

  test("missing generatedAt refuses at runtime, never reads the wall clock", () => {
    try {
      planSite({
        ctx: CTX,
        graph: tradeGraph(),
        vector: COPPERSMITH_VECTOR,
        generatedAt: undefined as never,
      });
      throw new Error("planSite did not refuse");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("GENERATED_AT_MISSING");
    }
  });
});

describe("composition compiler integration", () => {
  const plan = (graph = tradeGraph()) =>
    planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });

  const servicesSection = (graph = tradeGraph()) =>
    plan(graph)
      .spec.pages.flatMap((p) => p.sections)
      .find((s) => s.component === "Services");

  test("Services variant is stamped from measured cardinality (2 -> grid)", () => {
    expect(servicesSection()?.presentation.compositionVariant).toBe("grid");
  });

  test("Services variant switches to rows at >= 5 bound services", () => {
    const graph = tradeGraph();
    for (let i = 0; i < 4; i++) {
      const id = "svc-x-" + i;
      graph.objects.push(makeObject(id, "ping.social.service@1", { title: "Extra " + i }));
      graph.relationships.push(makeRelationship("rel-x-" + i, "biz-trade", "provides", id));
    }
    expect(servicesSection(graph)?.presentation.compositionVariant).toBe("rows");
  });

  test("layoutCharacter is stamped on theme tokens", () => {
    expect(plan().spec.themeTokens.layoutCharacter).toBe("CRAFT");
  });

  test("manifest records the signal compiler and its measured counts", () => {
    const planned = plan();
    expect(
      planned.manifest.notes.some((n) => n.includes("signals=fyd-signal-compiler@1")),
    ).toBe(true);
    expect(planned.manifest.notes.some((n) => n.includes("2 public services"))).toBe(true);
  });

  test("ObjectRail must-win is conditional on featureable objects", () => {
    // tradeGraph has featureable objects: ObjectRail is eligible and,
    // as a must-win, survives planning.
    const planned = plan();
    expect(planned.eligibility.counts.featureable).toBeGreaterThan(0);
    const components = planned.spec.pages.flatMap((p) =>
      p.sections.map((s) => s.component),
    );
    expect(components).toContain("ObjectRail");
    // Owner-only graph: nothing featureable, so ObjectRail is neither
    // eligible nor must-win; the planner never invents it.
    const bare = planSite({
      ctx: CTX,
      graph: {
        objects: [
          makeObject("biz-bare", "ping.social.business@1", {
            title: "Bare Business",
            fields: { phone: "555-0000" },
          }),
        ],
        relationships: [],
      },
      vector: COPPERSMITH_VECTOR,
      generatedAt: STAMP_A,
    });
    expect(bare.eligibility.counts.featureable).toBe(0);
    const bareComponents = bare.spec.pages.flatMap((p) =>
      p.sections.map((s) => s.component),
    );
    expect(bareComponents).not.toContain("ObjectRail");
  });

  test("composition variants are deterministic across runs", () => {
    const a = plan().canonicalSpecJson;
    const b = plan().canonicalSpecJson;
    expect(a).toBe(b);
  });
});

describe("relationship-driven composition", () => {
  /**
   * Minimal owner + person. The person joins the team ONLY through a
   * works_for edge (person -> business), the direction website-ingested
   * graphs actually record. The owner has no description, so the about
   * page can exist only when the team exists.
   */
  function teamGraph(withTeam: boolean): ObjectGraph {
    const owner = makeObject("biz-team", "ping.social.business@1", {
      title: "Solo Electric",
      description: "",
    });
    const tech = makeObject("person-sam", "ping.social.person@1", {
      title: "Sam Torres",
      fields: { name: "Sam Torres" },
    });
    const relationships = withTeam
      ? [makeRelationship("rel-team", "person-sam", "works_for", "biz-team")]
      : [];
    return { objects: [owner, tech], relationships };
  }

  function plan(graph: ObjectGraph) {
    return planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
  }

  test("works_for (person -> business) selects a People section and binds the person", () => {
    const graph = teamGraph(true);
    const planned = plan(graph);
    const home = planned.spec.pages.find((page) => page.slug === "home")!;
    const people = home.sections.find((section) => section.component === "People");
    expect(people).toBeDefined();
    // The section's query resolves the person THROUGH the works_for edge:
    // the relationship drives composition, not the object's mere presence.
    const bound = resolveQueryObjects(graph, people!.query, "biz-team").map((o) => o.id);
    expect(bound).toEqual(["person-sam"]);
    expect(planned.eligibility.eligible["People"]).toBe(true);
    // The about page exists only because the team exists: a relationship
    // selects a page, hence a navigation entry.
    const about = planned.spec.pages.find((page) => page.slug === "about");
    expect(about).toBeDefined();
    expect(about!.sections.map((section) => section.component)).toEqual(["People"]);
    expect(planned.spec.navigation.map((n) => n.pageSlug)).toContain("about");
    // The ObjectRail doorway features the person too.
    expect(home.sections.map((section) => section.component)).toContain("ObjectRail");
  });

  test("the same person object with no relationship selects no People section", () => {
    const graph = teamGraph(false);
    const planned = plan(graph);
    const components = planned.spec.pages.flatMap((page) =>
      page.sections.map((section) => section.component),
    );
    expect(components).not.toContain("People");
    // No team: the about page has nothing to say, so it (and its nav
    // entry) does not exist.
    expect(planned.spec.pages.map((page) => page.slug)).not.toContain("about");
    expect(planned.spec.navigation.map((n) => n.pageSlug)).not.toContain("about");
    expect(planned.eligibility.eligible["People"]).toBe(false);
  });

  test("inverse predicates bind symmetrically: employs forward == works_for backward", () => {
    const forward = teamGraph(false);
    forward.relationships = [makeRelationship("rel-team", "biz-team", "employs", "person-sam")];
    const withWorksFor = plan(teamGraph(true));
    const withEmploys = plan(forward);
    // Same team, same sections, same order: edge direction is invisible
    // to composition.
    const comps = (spec: typeof withWorksFor.spec) =>
      spec.pages.map((page) => page.slug + ":" + page.sections.map((s) => s.component).join(","));
    expect(comps(withEmploys.spec)).toEqual(comps(withWorksFor.spec));
    expect(withEmploys.semanticDigest).toBe(withWorksFor.semanticDigest);
  });

  test("graphs with and without works_for are structurally different, deterministically", () => {
    const runs = [0, 1, 2].map(() => ({
      withTeam: plan(teamGraph(true)),
      withoutTeam: plan(teamGraph(false)),
    }));
    // Determinism across repeated runs: byte-identical canonical specs.
    for (const run of runs.slice(1)) {
      expect(run.withTeam.canonicalSpecJson).toBe(runs[0].withTeam.canonicalSpecJson);
      expect(run.withoutTeam.canonicalSpecJson).toBe(runs[0].withoutTeam.canonicalSpecJson);
      expect(run.withTeam.semanticDigest).toBe(runs[0].withTeam.semanticDigest);
      expect(run.withoutTeam.semanticDigest).toBe(runs[0].withoutTeam.semanticDigest);
    }
    // Structural difference: different section sets AND different page sets.
    const withHome = runs[0].withTeam.spec.pages.find((page) => page.slug === "home")!;
    const withoutHome = runs[0].withoutTeam.spec.pages.find((page) => page.slug === "home")!;
    const withComps = withHome.sections.map((s) => s.component);
    const withoutComps = withoutHome.sections.map((s) => s.component);
    expect(withComps).toContain("People");
    expect(withComps).toContain("ObjectRail");
    expect(withoutComps).not.toContain("People");
    expect(withoutComps).not.toContain("ObjectRail");
    expect(withComps).not.toEqual(withoutComps);
    expect(runs[0].withTeam.semanticDigest).not.toBe(runs[0].withoutTeam.semanticDigest);
    // The shipped structural diff agrees: materially different.
    const diff = diffSiteSpecs(runs[0].withTeam.spec, runs[0].withoutTeam.spec, {
      tenantA: "team",
      tenantB: "no-team",
      digestA: runs[0].withTeam.semanticDigest,
      digestB: runs[0].withoutTeam.semanticDigest,
      plannerVersion: SITE_PLANNER_VERSION,
    });
    expect(diff.materiallyDifferent).toBe(true);
    expect(diff.pagesOnlyInA).toContain("about");
    expect(diff.materialReasons).toContain("different page sets");
  });

  test("overlay-touched owner: slots cite the current evidence ref, never the superseded base ref", () => {
    const graph = tradeGraph();
    const owner = graph.objects.find((o) => o.id === "biz-trade")!;
    const baseRef = owner.provenance!.ref;
    const latestRef = "ping-event:fyd-ovl-test-001";
    // Simulate journal overlays touching the owner after the base ingestion,
    // exactly like happy-place.json's updatedRefs in production data.
    owner.provenance = {
      ...owner.provenance!,
      updatedRefs: ["ping-event:fyd-seed-ovl-007", latestRef],
    };
    // Before the fix this threw BindingVerificationError: the planner stamped
    // the base ref while the verifier demanded the current ref (unsatisfiable).
    const planned = planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR, generatedAt: STAMP_A });
    // Every slot binding on the owner cites the current (latest) ref.
    const slotRefs = new Set<string | null>();
    for (const slot of planned.generatedPresentation.slots) {
      for (const b of slot.bindings) {
        if (b.objectId === owner.id) slotRefs.add(b.claimRef);
      }
    }
    expect(slotRefs.size).toBeGreaterThan(0);
    for (const r of slotRefs) expect(r).toBe(latestRef);
    // The verified render model agrees: no atom cites the superseded base ref.
    for (const atom of planned.verifiedRenderModel!.atoms) {
      const ref = (atom as { evidenceRef?: unknown }).evidenceRef;
      if (typeof ref === "string") expect(ref).not.toBe(baseRef);
    }
  });
});
