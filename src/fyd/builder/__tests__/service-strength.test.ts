/**
 * Item 6: the service-graph strength signal.
 *
 * The rule under test: service cardinality + evidence quality +
 * relationship topology -> a deterministic signal (score/tier/reasons)
 * that composition consumes. Same graph -> same signal, always.
 */
import {
  evidenceScore,
  FEATURED_SERVICE_COUNT,
  provenanceWeight,
  SERVICE_SIGNAL_VERSION,
  SERVICE_TIER_BOOST,
  serviceObjects,
  serviceSignal,
} from "../service-strength";
import { makeObject, makeRelationship } from "./fixtures";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import type { ObjectGraph } from "../../sitespec/types";

const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";
const LOC = "ping.social.location@1";

function serviceGraph(
  n: number,
  opts?: {
    provenanceKind?: string;
    words?: number;
    fields?: number;
    ownerPredicate?: string;
    withServiceEdges?: boolean;
  },
): ObjectGraph {
  const owner = makeObject("biz", BIZ, { title: "Biz" });
  const objects = [owner];
  const relationships = [];
  const desc = Array(opts?.words ?? 12).fill("word").join(" ");
  const fields: Record<string, string> = {};
  for (let i = 0; i < (opts?.fields ?? 2); i++) fields["f" + i] = "v" + i;
  for (let i = 0; i < n; i++) {
    const id = "svc-" + String(i).padStart(2, "0");
    objects.push(
      makeObject(id, SVC, {
        title: "Service " + i,
        description: desc,
        fields: { ...fields },
        provenance: {
          kind: opts?.provenanceKind ?? "website-derived",
          ref: "website-ingestion:https://example.com/",
          derivedAt: "2026-09-21T00:00:00.000Z",
        },
      }),
    );
    relationships.push(makeRelationship("rel-" + id, "biz", opts?.ownerPredicate ?? "offers", id));
  }
  if (opts?.withServiceEdges) {
    const loc = makeObject("loc-1", LOC, { title: "Town" });
    objects.push(loc);
    for (let i = 0; i < n; i++) {
      relationships.push(
        makeRelationship("rel-edge-" + i, "svc-" + String(i).padStart(2, "0"), "located_at", "loc-1"),
      );
    }
  }
  return { objects, relationships } as ObjectGraph;
}

describe("serviceSignal cardinality tiers", () => {
  test("0 services -> weak, 1 -> weak, 2 -> moderate, 12 rich -> dominant", () => {
    expect(serviceSignal(serviceGraph(0), "biz").tier).toBe("weak");
    expect(serviceSignal(serviceGraph(1), "biz").tier).toBe("weak");
    expect(serviceSignal(serviceGraph(2), "biz").tier).toBe("moderate");
    const strong = serviceSignal(serviceGraph(12, { words: 40 }), "biz");
    expect(strong.tier).toBe("dominant");
    expect(strong.cardinality).toBe(12);
  });

  test("4 website-derived rich services -> strong (the live-site shape)", () => {
    const s = serviceSignal(serviceGraph(4, { words: 20 }), "biz");
    expect(s.tier).toBe("strong");
    expect(SERVICE_TIER_BOOST[s.tier]).toBeGreaterThan(SERVICE_TIER_BOOST.moderate);
  });
});

describe("serviceSignal evidence quality", () => {
  test("website-derived + rich description outranks thin journal-only", () => {
    const rich = serviceSignal(serviceGraph(3, { provenanceKind: "website-derived", words: 60 }), "biz");
    const thin = serviceSignal(serviceGraph(3, { provenanceKind: "canonical-journal", words: 3, fields: 0 }), "biz");
    expect(rich.evidenceQuality).toBeGreaterThan(thin.evidenceQuality);
    expect(rich.score).toBeGreaterThan(thin.score);
  });

  test("provenance-kind vocabulary is pinned: changes fail loudly", () => {
    expect(provenanceWeight("website-derived")).toBe(3);
    expect(provenanceWeight("canonical-journal")).toBe(2);
    expect(provenanceWeight("owner-asserted")).toBe(1);
    expect(provenanceWeight(undefined)).toBe(1);
    // website-derived must strictly outrank every other known kind.
    expect(provenanceWeight("website-derived")).toBeGreaterThan(provenanceWeight("canonical-journal"));
  });
});

describe("serviceSignal topology", () => {
  test("services with their own edges outrank isolated services", () => {
    const connected = serviceSignal(serviceGraph(4, { withServiceEdges: true }), "biz");
    const isolated = serviceSignal(serviceGraph(4), "biz");
    expect(connected.topologyDepth).toBeGreaterThan(isolated.topologyDepth);
    expect(connected.score).toBeGreaterThan(isolated.score);
    // Same tier (topology alone does not promote), but a stronger score.
    expect(connected.tier).toBe(isolated.tier);
  });

  test("inverse predicates count: provided_by links are members too", () => {
    const g = serviceGraph(2, { ownerPredicate: "provided_by" });
    // Edge direction is owner <- service here; membership is direction-agnostic.
    const s = serviceSignal(g, "biz");
    expect(s.cardinality).toBe(2);
    expect(s.serviceIds).toEqual(["svc-00", "svc-01"]);
  });
});

describe("serviceSignal determinism", () => {
  test("shuffled input order -> identical signal", () => {
    const g = serviceGraph(6, { withServiceEdges: true });
    const shuffled: ObjectGraph = {
      objects: [...g.objects].reverse(),
      relationships: [...g.relationships].reverse(),
    } as ObjectGraph;
    const a = serviceSignal(g, "biz");
    const b = serviceSignal(shuffled, "biz");
    expect(b).toEqual(a);
    expect(a.serviceIds).toEqual([...a.serviceIds].sort());
  });

  test("score is quantized to 3 decimals and carries reasons", () => {
    const s = serviceSignal(serviceGraph(4), "biz");
    expect(s.score).toBe(Math.round(s.score * 1000) / 1000);
    expect(s.version).toBe(SERVICE_SIGNAL_VERSION);
    expect(s.reasons.length).toBeGreaterThan(0);
    expect(s.reasons.join(" ")).toMatch(/4 public service/);
  });

  test("topServiceIds: top-k by evidence score, id-sorted tiebreak", () => {
    const s = serviceSignal(serviceGraph(6), "biz");
    expect(s.topServiceIds).toHaveLength(FEATURED_SERVICE_COUNT);
    // All six have identical evidence: the lowest ids win, deterministically.
    expect(s.topServiceIds).toEqual(["svc-00", "svc-01", "svc-02"]);
  });
});

describe("serviceObjects membership mirrors the generator", () => {
  test("non-public services are excluded, deduped by id", () => {
    const g = serviceGraph(2);
    (g.objects as { visibility: string }[]).find((o) => o.id === "svc-01")!.visibility = "hidden";
    g.relationships.push(makeRelationship("rel-dup", "biz", "provides", "svc-00"));
    const members = serviceObjects(g, "biz");
    expect(members.map((m) => m.id)).toEqual(["svc-00"]);
  });
});

describe("live-site signal snapshots (guards the constant-vector regression)", () => {
  function ownerOf(g: ObjectGraph): string {
    return (g.objects as { id: string; schema: string }[]).find(
      (o) => o.schema === BIZ,
    )!.id;
  }

  test("coppersmith: 4 strong services -> strong", () => {
    const s = serviceSignal(COPPERSMITH_GRAPH as ObjectGraph, ownerOf(COPPERSMITH_GRAPH as ObjectGraph));
    expect(s.tier).toBe("strong");
    expect(s.cardinality).toBe(4);
    expect(s.score).toBe(13.36);
    expect(s.evidenceQuality).toBe(3.68);
    expect(s.topServiceIds).toHaveLength(3);
  });

  test("happy-place: 5 strong services -> strong", () => {
    const s = serviceSignal(HAPPY_PLACE_GRAPH as ObjectGraph, ownerOf(HAPPY_PLACE_GRAPH as ObjectGraph));
    expect(s.tier).toBe("strong");
    expect(s.cardinality).toBe(5);
    expect(s.score).toBe(14.736);
    expect(s.topServiceIds).toHaveLength(3);
  });

  test("a deliberate weak-service fixture scores lower than both live sites", () => {
    const weak = serviceSignal(serviceGraph(1, { provenanceKind: "canonical-journal", words: 3, fields: 0 }), "biz");
    expect(weak.tier).toBe("weak");
    expect(weak.score).toBeLessThan(13.36);
    expect(weak.score).toBeLessThan(14.736);
  });
});

describe("evidenceScore (hoisted, single owner)", () => {
  test("monotone in description words, fields, provenance ref", () => {
    const thin = makeObject("a", SVC, { description: "x" });
    const rich = makeObject("b", SVC, {
      description: Array(20).fill("word").join(" "),
      fields: { a: "1", b: "2" },
    });
    expect(evidenceScore(rich)).toBeGreaterThan(evidenceScore(thin));
    expect(evidenceScore(thin)).toBe(evidenceScore(thin));
  });
});
