/**
 * Graph signal compiler: measurement determinism, quantization, and the
 * count/cardinality -> dimension mapping.
 *
 * Synthetic graphs only; no customer facts.
 */
import { signalsForGraph } from "../signals";
import { knowledgeGraph, makeObject, makeRelationship, tradeGraph } from "./fixtures";
import type { ObjectGraph } from "../../sitespec/types";

const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";

describe("signalsForGraph", () => {
  test("same graph -> byte-identical signals", () => {
    const a = JSON.stringify(signalsForGraph(tradeGraph()));
    const b = JSON.stringify(signalsForGraph(tradeGraph()));
    expect(a).toBe(b);
  });

  test("the vector is quantized to three decimals and valid", () => {
    const { vector } = signalsForGraph(tradeGraph());
    for (const dim of Object.keys(vector) as (keyof typeof vector)[]) {
      expect(vector[dim]).toBeGreaterThanOrEqual(0);
      expect(vector[dim]).toBeLessThanOrEqual(1);
      expect(Number.isInteger(Math.round(vector[dim] * 1000))).toBe(true);
    }
  });

  test("trade fixture measures the documented counts", () => {
    const { counts } = signalsForGraph(tradeGraph());
    expect(counts.services).toBe(2);
    expect(counts.products).toBe(0);
    expect(counts.people).toBe(1);
    expect(counts.posts).toBe(1);
    expect(counts.articles).toBe(0);
    expect(counts.locations).toBe(1);
    expect(counts.offersEdges).toBe(2);
    expect(counts.emergencyHits).toBe(0);
    expect(counts.phonePresent).toBe(true);
    expect(counts.serviceAreaPresent).toBe(true);
  });

  test("trade fixture yields the documented dimension values", () => {
    const { vector } = signalsForGraph(tradeGraph());
    // urgency: 0.1 floor + 0.25 phone, no emergency language.
    expect(vector.urgency).toBeCloseTo(0.35, 3);
    expect(vector.trust_requirement).toBeCloseTo(0.375, 3);
    expect(vector.technical_depth).toBeCloseTo(0.1, 3);
    expect(vector.human_prominence).toBeCloseTo(0.3, 3);
    // No media manifest: neutral, documented as unknown.
    expect(vector.media_density).toBe(0.5);
    expect(vector.service_complexity).toBeCloseTo(0.288, 3);
    expect(vector.locality).toBeCloseTo(0.625, 3);
    expect(vector.evidence_density).toBeCloseTo(0.225, 3);
  });

  test("emergency language raises urgency, monotonically", () => {
    const base = signalsForGraph(tradeGraph()).vector.urgency;
    const graph = tradeGraph();
    graph.objects.push(
      makeObject("svc-emg", SVC, {
        title: "24/7 Emergency plumbing",
        description: "Urgent after-hours response.",
      }),
    );
    graph.relationships.push(makeRelationship("rel-emg", "biz-trade", "provides", "svc-emg"));
    const urgent = signalsForGraph(graph).vector.urgency;
    // "emergency" + "24/7" + "urgent" + "after-hours" = 4 hits:
    // 0.1 + 0.55 * (4/6) + 0.25 = 0.717.
    expect(urgent).toBeCloseTo(0.717, 3);
    expect(urgent).toBeGreaterThan(base);
  });

  test("service count raises service_complexity, monotonically", () => {
    const two = signalsForGraph(tradeGraph()).vector.service_complexity;
    const graph = tradeGraph();
    for (let i = 0; i < 4; i++) {
      const id = "svc-extra-" + i;
      graph.objects.push(makeObject(id, SVC, { title: "Extra " + i }));
      graph.relationships.push(makeRelationship("rel-extra-" + i, "biz-trade", "offers", id));
    }
    const six = signalsForGraph(graph).vector.service_complexity;
    expect(six).toBeGreaterThan(two);
  });

  test("articles raise technical_depth: knowledge graph over trade graph", () => {
    const trade = signalsForGraph(tradeGraph()).vector.technical_depth;
    const knowledge = signalsForGraph(knowledgeGraph()).vector.technical_depth;
    expect(knowledge).toBeGreaterThan(trade);
    // 2 articles: 0.1 + 0.8 * (2/6) = 0.367.
    expect(knowledge).toBeCloseTo(0.367, 3);
  });

  test("media manifest drives media_density; absence stays neutral", () => {
    const absent = signalsForGraph(tradeGraph());
    expect(absent.mediaSupplied).toBe(false);
    expect(absent.vector.media_density).toBe(0.5);
    const present = signalsForGraph(tradeGraph(), {
      galleryAssets: 9,
      heroAsset: true,
      photographicObjectIds: ["svc-drains"],
    });
    expect(present.mediaSupplied).toBe(true);
    // 0.15 + 0.5 * (9/17) + 0.2 + 0.15 * (1/6) = 0.640.
    expect(present.vector.media_density).toBeCloseTo(0.64, 3);
    expect(present.counts.galleryAssets).toBe(9);
    expect(present.counts.heroAsset).toBe(true);
    expect(present.counts.photoCoverage).toBeCloseTo(1 / 6, 3);
  });

  test("reasons cite the measured counts", () => {
    const { reasons } = signalsForGraph(tradeGraph());
    expect(reasons.join(" ")).toMatch(/2 public services/);
    expect(reasons.join(" ")).toMatch(/2 catalog edges/);
    expect(reasons.join(" ")).toMatch(/no media manifest supplied/);
  });

  test("empty graph measures floors, never throws", () => {
    const empty: ObjectGraph = { objects: [], relationships: [] };
    const { vector, counts } = signalsForGraph(empty);
    expect(counts.services).toBe(0);
    expect(vector.urgency).toBeCloseTo(0.1, 3);
    expect(vector.media_density).toBe(0.5);
  });
});
