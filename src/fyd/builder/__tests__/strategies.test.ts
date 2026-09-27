/**
 * Site strategies: the named composition substrate.
 *
 * The critical invariant: strategies are composition policies over one
 * shared substrate. The same object graph planned under all three
 * strategies must yield IDENTICAL factual claim bindings (object field
 * values) while the composition (section order) differs. A strategy may
 * reorder and emphasize; it may never change the facts.
 */
import { planSite, resolveQueryObjects, type PlannedSite } from "../planner";
import {
  SITE_STRATEGIES,
  SITE_STRATEGY_NAMES,
  type SiteStrategyName,
} from "../strategies";
import { inferStrategy } from "../infer-strategy";
import { strategyForSite } from "../strategy-for-site";
import { vectorForSite } from "../site-vectors";
import { normalizeOwnerIntent } from "../owner-intent";
import { getComponentDef } from "../../components/registry";
import { tradeGraph, makeObject, makeRelationship } from "./fixtures";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const CTX = { tenantId: "strategy-test-tenant" };
const STAMP = "2026-09-22T17:00:00.000Z";

const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";
const PROD = "ping.social.product@1";
const LOC = "ping.social.location@1";
const PERSON = "ping.social.person@1";
const POST = "ping.social.post@1";
const ARTICLE = "ping.social.article@1";

/**
 * Minimal fixture for the critical test: owner + one service, nothing
 * else. Home plans 7 sections, all must-wins, so no strategy's density
 * cap drops anything; the about and services pages plan 1 section each.
 * Small enough that composition (order) is the ONLY thing strategies can
 * change.
 */
function strategyFixtureGraph(): ObjectGraph {
  const owner = makeObject("biz-strategy", BIZ, {
    title: "Acme Strategy Fixture",
    description: "A minimal fixture for strategy composition tests.",
    fields: { phone: "555-0300" },
  });
  const svc = makeObject("svc-one", SVC, {
    title: "Only Service",
    description: "The single service.",
  });
  return {
    objects: [owner, svc],
    relationships: [makeRelationship("rel-1", "biz-strategy", "provides", "svc-one")],
  };
}

function canonicalFields(o: PingObject): string {
  const sorted: Record<string, string | string[]> = {};
  for (const k of Object.keys(o.fields ?? {}).sort()) sorted[k] = o.fields[k];
  return JSON.stringify(sorted);
}

/**
 * Every factual claim binding in a planned site, as an order-invariant
 * set: per surviving section, each bound object's field values; plus the
 * generated-copy slot bindings. Section ids, slot section ids, theme
 * tokens, ordering, and manifest notes are deliberately EXCLUDED: they
 * are composition, not facts.
 */
function factSet(planned: PlannedSite, graph: ObjectGraph): Set<string> {
  const facts = new Set<string>();
  const ownerId = planned.spec.ownerObjectId;
  for (const page of planned.spec.pages) {
    for (const s of page.sections) {
      const bound = resolveQueryObjects(graph, s.query, ownerId);
      for (const o of bound) {
        facts.add(
          JSON.stringify({
            component: s.component,
            objectId: o.id,
            title: o.title,
            description: o.description,
            fields: canonicalFields(o),
          }),
        );
      }
    }
  }
  for (const slot of planned.generatedPresentation.slots) {
    for (const b of slot.bindings) {
      facts.add(JSON.stringify({ slot: slot.slotId, objectId: b.objectId, field: b.field }));
    }
  }
  return facts;
}

function homeOrder(planned: PlannedSite): string[] {
  const home = planned.spec.pages.find((p) => p.slug === "home");
  if (!home) throw new Error("fixture must plan a home page");
  return home.sections.map((s) => s.component);
}

describe("site strategies: composition substrate", () => {
  test("CRITICAL: one graph through all three strategies -> identical fact sets", () => {
    const graph = strategyFixtureGraph();
    const plans = new Map<SiteStrategyName, PlannedSite>();
    for (const name of SITE_STRATEGY_NAMES) {
      plans.set(
        name,
        planSite({ ctx: CTX, graph, vector: SITE_STRATEGIES[name].vector, generatedAt: STAMP }),
      );
    }
    const factSets = SITE_STRATEGY_NAMES.map((name) => ({
      name,
      facts: [...factSet(plans.get(name)!, graph)].sort(),
    }));
    // The test is vacuous if nothing is bound; the fixture must bind facts.
    for (const { name, facts } of factSets) {
      expect(facts.length).toBeGreaterThan(0);
    }
    const reference = JSON.stringify(factSets[0].facts);
    for (const { name, facts } of factSets.slice(1)) {
      expect({ strategy: name, facts: JSON.stringify(facts) }).toEqual({
        strategy: name,
        facts: reference,
      });
    }
  });

  test("CRITICAL: composition differs between at least two strategies", () => {
    const graph = strategyFixtureGraph();
    const orders = new Map<SiteStrategyName, string>();
    for (const name of SITE_STRATEGY_NAMES) {
      const planned = planSite({
        ctx: CTX,
        graph,
        vector: SITE_STRATEGIES[name].vector,
        generatedAt: STAMP,
      });
      orders.set(name, homeOrder(planned).join(">"));
    }
    const distinct = new Set(orders.values());
    expect(distinct.size).toBeGreaterThan(1);
  });

  test("strategy vectors are the named preset vectors", () => {
    expect(SITE_STRATEGIES.KNOWLEDGE_WORKER.vector).toEqual(
      expect.objectContaining({ technical_depth: 0.55 }),
    );
    expect(SITE_STRATEGIES.TRADES.vector).toEqual(expect.objectContaining({ locality: 0.85 }));
    expect(SITE_STRATEGIES.TECHNOLOGY.vector).toEqual(
      expect.objectContaining({ technical_depth: 0.9 }),
    );
  });

  test("every sectionPriority entry is a real registry component", () => {
    for (const name of SITE_STRATEGY_NAMES) {
      const policy = SITE_STRATEGIES[name].policy;
      expect(policy.sectionPriority.length).toBeGreaterThan(0);
      for (const id of policy.sectionPriority) {
        expect(getComponentDef(id)).toBeDefined();
      }
      for (const w of Object.values(policy.objectEmphasis)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("inferStrategy", () => {
  test("trade-shaped graph -> TRADES, with counted reasons", () => {
    const r = inferStrategy(tradeGraph());
    expect(r.candidate).toBe("TRADES");
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons[0]).toMatch(/-> TRADES/);
    expect(r.reasons[0]).toMatch(/Service/);
  });

  test("article/person graph -> KNOWLEDGE_WORKER", () => {
    const owner = makeObject("biz-k", BIZ, { title: "Consultancy" });
    const graph: ObjectGraph = {
      objects: [
        owner,
        makeObject("art-1", ARTICLE, { title: "Essay one" }),
        makeObject("art-2", ARTICLE, { title: "Essay two" }),
        makeObject("p-1", PERSON, { title: "Jane Doe" }),
      ],
      relationships: [],
    };
    const r = inferStrategy(graph);
    expect(r.candidate).toBe("KNOWLEDGE_WORKER");
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons[0]).toMatch(/2 Article \+ 0 Post \+ 1 Person/);
  });

  test("product graph -> TECHNOLOGY", () => {
    const graph: ObjectGraph = {
      objects: [
        makeObject("biz-t", BIZ, { title: "DevTools Inc" }),
        makeObject("prod-1", PROD, { title: "Widget SDK" }),
        makeObject("prod-2", PROD, { title: "Widget CLI" }),
      ],
      relationships: [],
    };
    const r = inferStrategy(graph);
    expect(r.candidate).toBe("TECHNOLOGY");
    expect(r.reasons[0]).toMatch(/2 Product objects -> TECHNOLOGY/);
  });

  test("tie breaks by fixed order: TECHNOLOGY before KNOWLEDGE_WORKER before TRADES", () => {
    const graph: ObjectGraph = {
      objects: [
        makeObject("biz-tie", BIZ, { title: "Tie Co" }),
        makeObject("prod-1", PROD, { title: "A product" }),
        makeObject("art-1", ARTICLE, { title: "An article" }),
      ],
      relationships: [],
    };
    // tech score 1, knowledge score 1, trades score 0 -> TECHNOLOGY wins ties.
    expect(inferStrategy(graph).candidate).toBe("TECHNOLOGY");
  });

  test("empty graph -> KNOWLEDGE_WORKER neutral default, never invented", () => {
    const r = inferStrategy({ objects: [], relationships: [] });
    expect(r.candidate).toBe("KNOWLEDGE_WORKER");
    expect(r.reasons).toEqual(["no classifiable objects; neutral default"]);
  });

  test("post + location + service-area signal mix scores deterministically", () => {
    const graph: ObjectGraph = {
      objects: [
        makeObject("biz-m", BIZ, {
          title: "Mixed Co",
          fields: { serviceArea: "Valley-wide" },
        }),
        makeObject("svc-1", SVC, { title: "A service" }),
        makeObject("loc-1", LOC, { title: "Town" }),
        makeObject("post-1", POST, { title: "A post" }),
      ],
      relationships: [],
    };
    // trades: 1 service + 1 location + 1 signal = 3; knowledge: 1 post = 1.
    const r = inferStrategy(graph);
    expect(r.candidate).toBe("TRADES");
    expect(r.reasons[0]).toMatch(/1 Service \+ 1 Location objects \+ 1 phone\/service-area signals/);
  });
});

describe("strategyForSite", () => {
  test("no pins: graph inference is the default, even for known site ids", () => {
    // tradeGraph infers TRADES; no tenant pin may short-circuit that.
    // (Falsifier F1: hand-authored pins used to force TECHNOLOGY/TRADES.)
    expect(strategyForSite("ping-fyd", tradeGraph()).name).toBe("TRADES");
    expect(strategyForSite("coppersmith-plumbing", tradeGraph()).name).toBe("TRADES");
  });

  test("unpinned site falls through to inference", () => {
    expect(strategyForSite("some-new-site", tradeGraph()).name).toBe("TRADES");
  });

  test("owner override wins over inference", () => {
    const s = strategyForSite("coppersmith-plumbing", tradeGraph(), { strategy: "KNOWLEDGE_WORKER" });
    expect(s.name).toBe("KNOWLEDGE_WORKER");
    expect(s).toBe(SITE_STRATEGIES.KNOWLEDGE_WORKER);
  });

  test("invalid owner override is ignored, never throws", () => {
    const s = strategyForSite("coppersmith-plumbing", tradeGraph(), {
      strategy: "BOGUS",
    } as unknown as { strategy: "TRADES" });
    expect(s.name).toBe("TRADES");
  });

  test("unknown site + empty graph -> neutral default, never throws", () => {
    const s = strategyForSite("no-such-site", { objects: [], relationships: [] });
    expect(s.name).toBe("KNOWLEDGE_WORKER");
    expect(strategyForSite("no-such-site").name).toBe("KNOWLEDGE_WORKER");
  });

  test("vectorForSite measures the graph by default; strategy layer is the fallback", () => {
    // Explicit graph: the measured signal vector, not a hand-authored preset.
    const measured = vectorForSite("ping-fyd", tradeGraph());
    expect(measured).not.toEqual(SITE_STRATEGIES.TECHNOLOGY.vector);
    expect(measured.urgency).toBeCloseTo(0.35, 3);
    // Owner override still selects the named preset explicitly.
    expect(vectorForSite("x", null, { strategy: "TRADES" })).toEqual(
      SITE_STRATEGIES.TRADES.vector,
    );
    // No graph and no projection on disk: the neutral strategy fallback.
    // Never throws, never invents. The projection dir is pointed at an
    // empty directory so the test is independent of Pig disk state.
    const prev = process.env.FYD_PROJECTION_DIR;
    process.env.FYD_PROJECTION_DIR = "/tmp/lane4-empty-projections";
    try {
      expect(vectorForSite("unknown-site")).toEqual(
        SITE_STRATEGIES.KNOWLEDGE_WORKER.vector,
      );
    } finally {
      if (prev === undefined) delete process.env.FYD_PROJECTION_DIR;
      else process.env.FYD_PROJECTION_DIR = prev;
    }
  });
});

describe("owner intent strategy field", () => {
  test("normalizeOwnerIntent carries a valid strategy, drops garbage", () => {
    expect(normalizeOwnerIntent({ strategy: "TRADES" }).strategy).toBe("TRADES");
    expect(
      normalizeOwnerIntent({ strategy: "BOGUS" } as unknown as { strategy: "TRADES" }).strategy,
    ).toBeUndefined();
    expect(normalizeOwnerIntent({}).strategy).toBeUndefined();
    expect(normalizeOwnerIntent(null).strategy).toBeUndefined();
  });
});

describe("strategy determinism", () => {
  test("same input -> byte-identical strategy, policy, and inference JSON", () => {
    const a = strategyForSite("coppersmith-plumbing", tradeGraph(), { strategy: "TECHNOLOGY" });
    const b = strategyForSite("coppersmith-plumbing", tradeGraph(), { strategy: "TECHNOLOGY" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.policy)).toBe(JSON.stringify(b.policy));
    const ia = inferStrategy(tradeGraph());
    const ib = inferStrategy(tradeGraph());
    expect(JSON.stringify(ia)).toBe(JSON.stringify(ib));
    const va = strategyForSite("some-new-site", tradeGraph());
    const vb = strategyForSite("some-new-site", tradeGraph());
    expect(JSON.stringify(va)).toBe(JSON.stringify(vb));
  });
});
