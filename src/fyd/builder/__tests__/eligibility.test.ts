/**
 * Deterministic eligibility rules over the object graph.
 */
import { deriveEligibility } from "../eligibility";
import { knowledgeGraph, makeObject, tradeGraph } from "./fixtures";
import type { ObjectGraph } from "../../sitespec/types";

describe("eligibility", () => {
  test("trade graph: services, locations, team, connected, recent all eligible", () => {
    const e = deriveEligibility(tradeGraph());
    expect(e.counts.services).toBe(2);
    expect(e.counts.locations).toBe(1);
    expect(e.counts.team).toBe(1); // person + works_for
    expect(e.counts.connected).toBeGreaterThan(0); // external identity + website field
    expect(e.counts.posts).toBe(1);
    for (const c of ["Services", "Locations", "People", "Links", "Posts", "RecentObjects", "Contact", "Hero", "AskFYD"]) {
      expect(e.eligible[c]).toBe(true);
    }
    // 2 services + 1 post are featureable: the inline ObjectRail doorway
    // is eligible. (The fixture's person is linked works_for-only, which
    // neither the generator nor eligibility count as a forward feature.)
    expect(e.counts.featureable).toBe(3);
    expect(e.eligible["ObjectRail"]).toBe(true);
    expect(e.reasons["ObjectRail"]).toMatch(/featureable related objects 3 > 0/);
    // The generator emits no SocialProof: never invented.
    expect(e.eligible["SocialProof"]).toBe(false);
  });

  test("knowledge graph: no team, articles count as recent", () => {
    const e = deriveEligibility(knowledgeGraph());
    expect(e.counts.team).toBe(0);
    expect(e.eligible["People"]).toBe(false);
    expect(e.counts.articles).toBe(2);
    expect(e.eligible["RecentObjects"]).toBe(true);
    expect(e.eligible["Services"]).toBe(true);
  });

  test("service count 0 -> Services ineligible, with reason", () => {
    const g = tradeGraph();
    const noServices: ObjectGraph = {
      objects: g.objects.filter((o) => o.schema !== "ping.social.service@1"),
      relationships: g.relationships.filter(
        (r) => r.predicate !== "provides" && r.predicate !== "offers",
      ),
    };
    const e = deriveEligibility(noServices);
    expect(e.counts.services).toBe(0);
    expect(e.eligible["Services"]).toBe(false);
    expect(e.reasons["Services"]).toMatch(/service count 0/);
  });

  test("no owner -> nothing eligible", () => {
    const g = tradeGraph();
    const ownerless: ObjectGraph = {
      objects: g.objects.filter((o) => o.id !== "biz-trade"),
      relationships: [],
    };
    const e = deriveEligibility(ownerless);
    expect(e.counts.ownerPresent).toBe(false);
    expect(e.eligible["Hero"]).toBe(false);
    expect(e.eligible["Services"]).toBe(false);
    expect(e.eligible["ObjectRail"]).toBe(false);
    expect(e.eligible["CTA"]).toBe(false);
  });

  test("ObjectRail ineligible when nothing is featureable", () => {
    const g = tradeGraph();
    const bare: ObjectGraph = {
      objects: g.objects.filter(
        (o) =>
          ![
            "ping.social.service@1",
            "ping.social.person@1",
            "ping.social.post@1",
            "ping.social.article@1",
            "ping.social.product@1",
          ].includes(o.schema),
      ),
      relationships: g.relationships.filter(
        (r) =>
          !["provides", "offers", "works_for", "employs", "publishes"].includes(
            r.predicate,
          ),
      ),
    };
    const e = deriveEligibility(bare);
    expect(e.counts.ownerPresent).toBe(true);
    expect(e.counts.featureable).toBe(0);
    expect(e.eligible["ObjectRail"]).toBe(false);
    // CTA is a site capability: still eligible with an owner.
    expect(e.eligible["CTA"]).toBe(true);
  });

  test("person without works_for is not team", () => {
    const g = tradeGraph();
    const detached: ObjectGraph = {
      objects: g.objects,
      relationships: g.relationships.filter((r) => r.predicate !== "works_for"),
    };
    const e = deriveEligibility(detached);
    expect(e.counts.team).toBe(0);
    expect(e.eligible["People"]).toBe(false);
  });

  test("eligibility is deterministic", () => {
    const a = JSON.stringify(deriveEligibility(tradeGraph()));
    const b = JSON.stringify(deriveEligibility(tradeGraph()));
    expect(a).toBe(b);
  });

  test("private objects never count toward eligibility", () => {
    const g = tradeGraph();
    const priv = makeObject("svc-secret", "ping.social.service@1", {
      visibility: "private",
      title: "Secret service",
    });
    const withPrivate: ObjectGraph = {
      objects: [...g.objects, priv],
      relationships: [
        ...g.relationships,
        {
          id: "rel-x", subject: "biz-trade", predicate: "provides", object: "svc-secret",
          status: "active", createdAt: "2026-09-21T00:00:00.000Z",
          evidenceRef: "website-ingestion:https://example.com/",
        },
      ],
    };
    const e = deriveEligibility(withPrivate);
    expect(e.counts.services).toBe(2);
  });
});
