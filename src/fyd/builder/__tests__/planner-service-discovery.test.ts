/**
 * Item 6: service-graph strength influences composition.
 *
 * Same strategy vector, two graphs: a strong service graph must surface
 * Services earlier and feature its strongest services; a weak graph must
 * not. Owner intent (priorities / pre-set featuredIds) always wins.
 */
import { planSite } from "../planner";
import { COPPERSMITH_VECTOR } from "../dimensions";
import { serviceSignal } from "../service-strength";
import { makeObject, makeRelationship } from "./fixtures";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import type { ObjectGraph } from "../../sitespec/types";

const CTX = { tenantId: "discovery-tenant" };
const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";
const LOC = "ping.social.location@1";

function discoveryGraph(n: number, rich: boolean): ObjectGraph {
  const owner = makeObject("biz", BIZ, {
    title: "Biz",
    description: "A business.",
    fields: { phone: "555-0100", locality: "Town" },
  });
  const objects = [owner];
  const relationships: ReturnType<typeof makeRelationship>[] = [];
  for (let i = 0; i < n; i++) {
    const id = "svc-" + String(i).padStart(2, "0");
    objects.push(
      makeObject(id, SVC, {
        title: "Service " + i,
        description: rich
          ? "We install, maintain and repair systems of every kind for homes and businesses across the valley, with free estimates."
          : "fix",
        fields: rich ? { price: "$", duration: "1h" } : {},
        provenance: {
          kind: rich ? "website-derived" : "canonical-journal",
          ref: "website-ingestion:https://example.com/",
          derivedAt: "2026-09-21T00:00:00.000Z",
        },
      }),
    );
    relationships.push(makeRelationship("rel-" + id, "biz", "offers", id));
  }
  if (rich) {
    const loc = makeObject("loc-1", LOC, { title: "Town" });
    objects.push(loc);
    for (let i = 0; i < n; i++) {
      relationships.push(
        makeRelationship("rel-edge-" + i, "svc-" + String(i).padStart(2, "0"), "located_at", "loc-1"),
      );
    }
  }
  return { objects, relationships } as unknown as ObjectGraph;
}

const homeComponents = (graph: ObjectGraph, ownerIntent?: Parameters<typeof planSite>[0]["ownerIntent"]) =>
  planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR, ownerIntent }).spec.pages.find(
    (p) => p.slug === "home",
  )!.sections.map((s) => s.component);

const servicesSection = (graph: ObjectGraph, ownerIntent?: Parameters<typeof planSite>[0]["ownerIntent"]) =>
  planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR, ownerIntent }).spec.pages
    .flatMap((p) => p.sections)
    .filter((s) => s.component === "Services");

describe("service-graph boost", () => {
  test("same vector: strong service graph surfaces Services earlier than a weak one", () => {
    // technical_depth lifts BusinessSummary (rank 2 - 0.45 = 1.55) ahead of
    // an unboosted Services (rank 3 - 0.9 - 0 = 2.1); the dominant signal's
    // boost (1.5) moves Services back ahead (0.6 -> clamped 0.5).
    const vector = { ...COPPERSMITH_VECTOR, technical_depth: 0.9 };
    const weak = discoveryGraph(1, false);
    const strong = discoveryGraph(12, true);
    expect(serviceSignal(weak, "biz").tier).toBe("weak");
    expect(serviceSignal(strong, "biz").tier).toBe("dominant");
    const weakOrder = planSite({ ctx: CTX, graph: weak, vector }).spec.pages.find((p) => p.slug === "home")!.sections.map((s) => s.component);
    const strongOrder = planSite({ ctx: CTX, graph: strong, vector }).spec.pages.find((p) => p.slug === "home")!.sections.map((s) => s.component);
    expect(weakOrder).toContain("Services");
    expect(strongOrder).toContain("Services");
    expect(weakOrder.indexOf("Services")).toBeGreaterThan(weakOrder.indexOf("BusinessSummary"));
    expect(strongOrder.indexOf("Services")).toBeLessThan(strongOrder.indexOf("BusinessSummary"));
    expect(strongOrder.indexOf("Services")).toBeLessThan(weakOrder.indexOf("Services"));
  });

  test("hero stays first even under a dominant signal", () => {
    const order = homeComponents(discoveryGraph(12, true));
    expect(order[0]).toBe("Hero");
  });

  test("featuredIds set only on strong signals, as the deterministic top-k", () => {
    const weakSections = servicesSection(discoveryGraph(2, false));
    expect(weakSections.length).toBeGreaterThan(0);
    for (const s of weakSections) expect(s.presentation.featuredIds ?? []).toEqual([]);

    const strong = discoveryGraph(12, true);
    const signal = serviceSignal(strong, "biz");
    const strongSections = servicesSection(strong);
    expect(strongSections.length).toBeGreaterThan(0);
    for (const s of strongSections) {
      expect(s.presentation.featuredIds).toEqual(signal.topServiceIds.slice(0, 3));
    }
    // The featured set is the top-3 by evidence score: the richest descriptions win.
    expect(signal.topServiceIds).toHaveLength(3);
  });

  test("identical inputs -> identical semantic digest (signal is deterministic)", () => {
    const g = discoveryGraph(12, true);
    const a = planSite({ ctx: CTX, graph: g, vector: COPPERSMITH_VECTOR });
    const b = planSite({ ctx: CTX, graph: discoveryGraph(12, true), vector: COPPERSMITH_VECTOR });
    expect(a.semanticDigest).toBe(b.semanticDigest);
    expect(a.canonicalSpecJson).toBe(b.canonicalSpecJson);
  });

  test("the service-signal rule is recorded in manifest.notes", () => {
    const planned = planSite({ ctx: CTX, graph: discoveryGraph(12, true), vector: COPPERSMITH_VECTOR });
    const note = planned.manifest.notes.find((n) => n.startsWith("service-signal:"));
    expect(note).toBeDefined();
    expect(note).toMatch(/tier=dominant/);
    expect(note).toMatch(/cardinality=12/);
  });
});

describe("owner override precedence (owner > pin > inference)", () => {
  test("an explicit Services priority yields the automatic signal", () => {
    const g = discoveryGraph(12, true);
    const auto = planSite({ ctx: CTX, graph: g, vector: COPPERSMITH_VECTOR });
    const owned = planSite({
      ctx: CTX,
      graph: g,
      vector: COPPERSMITH_VECTOR,
      ownerIntent: { priorities: ["Services"] },
    });
    const note = owned.manifest.notes.find((n) => n.startsWith("service-signal:"));
    expect(note).toMatch(/yielded to owner intent/);
    for (const s of owned.spec.pages.flatMap((p) => p.sections).filter((s) => s.component === "Services")) {
      expect(s.presentation.featuredIds ?? []).toEqual([]);
    }
    // No automatic boost: the owner's plan differs from the automatic one.
    expect(owned.semanticDigest).not.toBe(auto.semanticDigest);
  });
});

describe("live-site expectations", () => {
  test("coppersmith + happy-place fixture graphs get strong signals and featured services", () => {
    for (const g of [COPPERSMITH_GRAPH, HAPPY_PLACE_GRAPH] as ObjectGraph[]) {
      const planned = planSite({ ctx: CTX, graph: g, vector: COPPERSMITH_VECTOR });
      const note = planned.manifest.notes.find((n) => n.startsWith("service-signal:"));
      expect(note).toMatch(/tier=strong/);
      const sections = planned.spec.pages
        .flatMap((p) => p.sections)
        .filter((s) => s.component === "Services");
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s.presentation.featuredIds).toBeDefined();
        expect(s.presentation.featuredIds!.length).toBe(3);
      }
    }
  });
});
