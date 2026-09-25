/**
 * Tests for the margin object selection pipeline
 * (graph -> eligibility -> contextual selection -> projection).
 *
 * Nolan 2026-09-25: MarginObjectLayer was built and unit-tested but never
 * mounted; the ?objectDebug=1 gate is not the production path. These tests
 * pin the production feed: deterministic eligibility first, contextual
 * section anchoring, evidence-backed projection, nothing invented.
 */

import { selectMarginObjects } from "../object-layer/margin-select";
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { FYDPage, ObjectGraph } from "@/fyd/sitespec/types";

const PROV = {
  kind: "website-derived" as const,
  ref: "https://example.com",
  derivedAt: "2026-09-24T00:00:00Z",
};

function obj(partial: Partial<PingObject> & { id: string }): PingObject {
  return {
    schema: "ping.social.service@1",
    controllerId: "web:example",
    visibility: "public",
    title: partial.id,
    description: "",
    fields: {},
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    provenance: PROV,
    ...partial,
  };
}

function rel(
  id: string,
  subject: string,
  predicate: string,
  object: string,
  status: "active" | "inactive" = "active",
): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status,
    createdAt: "2026-09-24T00:00:00Z",
    evidenceRef: "evt-1",
  };
}

const OWNER = "biz-1";

function page(sections: FYDPage["sections"]): FYDPage {
  return {
    slug: "home",
    title: "Home",
    navLabel: "Home",
    sections,
  };
}

function section(
  id: string,
  component: string,
  query: FYDPage["sections"][number]["query"],
): FYDPage["sections"][number] {
  return { id, component, query, presentation: {} };
}

describe("selectMarginObjects", () => {
  const biz = obj({ id: OWNER, schema: "ping.social.business@1", title: "Example Biz" });
  const svc1 = obj({
    id: "svc-1",
    title: "Carpentry",
    description:
      "Fine carpentry and custom woodwork for homes across the valley, built to last generations.",
    fields: { website: "https://example.com" },
  });
  const svc2 = obj({ id: "svc-2", title: "Repairs" });
  const per1 = obj({ id: "per-1", schema: "ping.social.person@1", title: "Jane Doe" });
  const loc1 = obj({
    id: "loc-1",
    schema: "ping.social.location@1",
    title: "Grand Junction, Colorado",
  });
  const post1 = obj({ id: "post-1", schema: "ping.social.post@1", title: "News" });

  const graph: ObjectGraph = {
    objects: [biz, svc1, svc2, per1, loc1, post1],
    relationships: [
      rel("r1", OWNER, "offers", "svc-1"),
      rel("r2", OWNER, "offers", "svc-2"),
      rel("r3", "per-1", "works_for", OWNER),
      rel("r4", OWNER, "located_at", "loc-1"),
      rel("r5", "svc-1", "located_at", "loc-1"),
      rel("r6", OWNER, "publishes", "post-1"),
    ],
  } as ObjectGraph;

  const home = page([
    section("home:Services:0", "Services", {
      kind: "related",
      from: OWNER,
      predicate: "offers",
      predicates: ["offers", "provides"],
    }),
    section("home:People:1", "People", {
      kind: "related",
      from: OWNER,
      predicate: "works_for",
      predicates: ["works_for", "employs"],
    }),
    section("home:Locations:2", "Locations", {
      kind: "related",
      from: OWNER,
      predicate: "located_at",
      predicates: ["located_at"],
    }),
    section("home:BusinessSummary:3", "BusinessSummary", { kind: "owner" }),
  ]);

  test("selects only eligible roles, anchored to their first containing section", () => {
    const out = selectMarginObjects({
      graph,
      page: home,
      ownerId: OWNER,
      siteId: "happy-place",
    });
    const ids = out.map((d) => d.objectId);
    // eligible: 2 services + person + location; business + post excluded
    expect(ids.sort()).toEqual(["loc-1", "per-1", "svc-1", "svc-2"]);
    const byId = new Map(out.map((d) => [d.objectId, d]));
    expect(byId.get("svc-1")!.anchorKey).toBe("home:Services:0");
    expect(byId.get("svc-2")!.anchorKey).toBe("home:Services:0");
    expect(byId.get("per-1")!.anchorKey).toBe("home:People:1");
    expect(byId.get("loc-1")!.anchorKey).toBe("home:Locations:2");
  });

  test("first containing section wins when an object appears in two sections", () => {
    const twoSection = page([
      section("home:Services:0", "Services", {
        kind: "related",
        from: OWNER,
        predicate: "offers",
        predicates: ["offers"],
      }),
      section("home:Featured:1", "Featured", {
        kind: "reference",
        objectIds: ["svc-1", "per-1"],
      }),
    ]);
    const out = selectMarginObjects({
      graph,
      page: twoSection,
      ownerId: OWNER,
      siteId: "happy-place",
    });
    const byId = new Map(out.map((d) => [d.objectId, d]));
    expect(byId.get("svc-1")!.anchorKey).toBe("home:Services:0");
    expect(byId.get("per-1")!.anchorKey).toBe("home:Featured:1");
  });

  test("eligible objects with no containing section are skipped", () => {
    const noMatch = page([
      section("home:BusinessSummary:0", "BusinessSummary", { kind: "owner" }),
    ]);
    const out = selectMarginObjects({
      graph,
      page: noMatch,
      ownerId: OWNER,
      siteId: "happy-place",
    });
    expect(out).toEqual([]);
  });

  test("projection is evidence-backed: website safety, whyHere trim, real relationships", () => {
    const risky = obj({
      id: "svc-9",
      title: "Risky",
      fields: { website: "javascript:alert(1)" },
    });
    const g2 = {
      ...graph,
      objects: [...graph.objects, risky],
      relationships: [
        ...graph.relationships,
        rel("r9", OWNER, "offers", "svc-9"),
      ],
    } as ObjectGraph;
    const out = selectMarginObjects({
      graph: g2,
      page: home,
      ownerId: OWNER,
      siteId: "happy-place",
    });
    const byId = new Map(out.map((d) => [d.objectId, d]));
    const d1 = byId.get("svc-1")!;
    expect(d1.name).toBe("Carpentry");
    // resolveSafeLink normalizes the href (trailing slash); the point is
    // the safe URL passes through and unsafe ones fail closed.
    expect(d1.websiteUrl).toBe("https://example.com/");
    expect(d1.whyHere).toBe(
      "Fine carpentry and custom woodwork for homes across the valley, built to last generations.",
    );
    expect(d1.siteId).toBe("happy-place");
    // real outgoing edge svc-1 -> loc-1
    expect(d1.relationships.map((r) => r.objectId)).toEqual(["loc-1"]);
    expect(d1.relationships[0].name).toBe("Grand Junction, Colorado");
    // unsafe website fails closed
    expect(byId.get("svc-9")!.websiteUrl).toBeNull();
    // location label is evidence-backed
    expect(byId.get("loc-1")!.location).toBe("Grand Junction, Colorado");
    // nothing invented
    expect(d1.imageSrc).toBeNull();
    expect(d1.category).toBeNull();
  });

  test("output order is deterministic: section order, then priority, then id", () => {
    const run = () =>
      selectMarginObjects({ graph, page: home, ownerId: OWNER, siteId: "s" });
    const a = run().map((d) => d.objectId);
    const b = run().map((d) => d.objectId);
    expect(a).toEqual(b);
    // services (priority 0) before person (2) before location (3) only
    // when sections tie; here section order dominates
    expect(a).toEqual(["svc-1", "svc-2", "per-1", "loc-1"]);
  });

  test("priority orders same-section objects: service before location", () => {
    const mixed = page([
      section("home:All:0", "All", { kind: "all" }),
    ]);
    const out = selectMarginObjects({
      graph,
      page: mixed,
      ownerId: OWNER,
      siteId: "s",
    });
    expect(out.map((d) => d.objectId)).toEqual([
      "svc-1",
      "svc-2",
      "per-1",
      "loc-1",
    ]);
  });
});
