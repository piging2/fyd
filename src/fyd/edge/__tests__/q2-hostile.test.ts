/**
 * FYD-Q2 HOSTILE TEST (mandatory, ported): privacy survives expansion.
 *
 * Scenario: the owner HIDES the business address. The hidden location
 * object (visibility "private") must be unrecoverable through every
 * expansion path a visitor can reach:
 *
 *   1. business edge -> location (object sheet traversal)
 *   2. Ask FYD -> location (object-scoped ask through the REAL ask lane)
 *   3. search -> location (query resolution)
 *   4. related object -> location (traverse from every visible object)
 *   5. why-this -> location (the route's visibility gate)
 *
 * ZERO public disclosure on every attempt. The edge graph must never
 * become a privacy bypass.
 *
 * The hostile graph is built in-memory: a business plus a HIDDEN location
 * carrying a street address no fixture contains. All attacks run through
 * the REAL code paths the HTTP layer calls (buildObjectSheet,
 * answerAskFyd with an injected bundle, resolveQuery,
 * applyPublicVisibilityGate). The ungated control proves the fact survives
 * hiding (visibility policy, not deletion): the owner-side record still
 * carries the private object.
 */

import { buildObjectSheet, applyPublicVisibilityGate, EDGE_VISITOR } from "../resolve";
import { verifyPublicProjection } from "../../sitespec/public-projection";
import { answerAskFyd } from "../../ask/visitor-answer";
import type { SiteBundle } from "../../media/site-bundle";
import { resolveQuery } from "../../components/renderer";
import type { ObjectGraph, FYDQuery } from "../../sitespec/types";
import type { PingObject, PingRelationship } from "@/lib/ping/types";

const COPPER_BUSINESS = "test-business-copper-0001";
const HIDDEN_LOCATION_ID = "test-hidden-location-0001";
const HIDDEN_ADDRESS = "742 Hidden Lane, Grand Junction, CO 81501";

function obj(
  id: string,
  schema: string,
  title: string,
  fields: Record<string, string | string[]> = {},
  visibility: "public" | "private" = "public",
): PingObject {
  return {
    id,
    schema,
    controllerId: "identity_test",
    visibility,
    title,
    description: title + " description.",
    fields: { claimKind: "website_statement", ...fields },
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.test/",
      derivedAt: "2026-09-24T00:00:00Z",
    },
  };
}

/** The hostile graph: business + public service/location + HIDDEN location.
 *  The address string appears nowhere else, so any appearance in an attack
 *  result is a leak, full stop. */
function hostileGraph(): ObjectGraph {
  const location: PingObject = obj(
    HIDDEN_LOCATION_ID,
    "ping.social.location@1",
    "Business headquarters",
    {
      street_address: HIDDEN_ADDRESS,
      evidence_ref: "service-cards:contact:address",
    },
    "private", // OWNER HIDES THE ADDRESS
  );
  const business = obj(COPPER_BUSINESS, "ping.social.business@1", "Test Plumbing Co", {
    phone: "(970) 555-0100",
  });
  const service = obj("test-service-0001", "ping.social.service@1", "Drain Cleaning");
  const publicLoc = obj("test-location-0001", "ping.social.location@1", "Service Area", {
    locality: "Grand Junction, CO",
  });
  const relationships: PingRelationship[] = [
    {
      id: "hr1",
      subject: COPPER_BUSINESS,
      predicate: "offers",
      object: "test-service-0001",
      status: "active",
      createdAt: "2026-09-24T00:00:00Z",
      evidenceRef: "test:offers",
    },
    {
      id: "hr2",
      subject: COPPER_BUSINESS,
      predicate: "located_at",
      object: "test-location-0001",
      status: "active",
      createdAt: "2026-09-24T00:00:00Z",
      evidenceRef: "test:located_at",
    },
    {
      id: "hr3",
      subject: COPPER_BUSINESS,
      predicate: "located_at",
      object: HIDDEN_LOCATION_ID,
      status: "active",
      createdAt: "2026-09-24T00:00:00Z",
      evidenceRef: "test:located_at_hidden",
    },
    {
      id: "hr4",
      subject: "test-service-0001",
      predicate: "provided_by",
      object: COPPER_BUSINESS,
      status: "active",
      createdAt: "2026-09-24T00:00:00Z",
      evidenceRef: "test:provided_by",
    },
  ];
  return { objects: [business, service, publicLoc, location], relationships };
}

function bundleFor(graph: ObjectGraph): SiteBundle {
  return {
    siteId: "test-hostile",
    businessName: "Test Plumbing Co",
    graph,
    spec: {
      ownerObjectId: COPPER_BUSINESS,
      pages: [{ slug: "home", title: "Test Plumbing Co", navLabel: "Home", sections: [] }],
    } as SiteBundle["spec"],
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}


/** Wrap a raw fixture graph in the anonymous verified projection.
 *  Every sheet under test now runs through the Q-C-01 boundary. */
const verify = (graph: ObjectGraph) => verifyPublicProjection(graph, [], "anonymous");

describe("FYD-Q2 hostile: hidden address survives every expansion path", () => {
  test("1. business edge -> location: sheet never carries the hidden object", () => {
    const g = hostileGraph();
    const sheet = buildObjectSheet(verify(g), COPPER_BUSINESS, EDGE_VISITOR);
    expect(sheet).not.toBeNull();
    const text = JSON.stringify(sheet);
    expect(text).not.toContain(HIDDEN_ADDRESS);
    expect(text).not.toContain(HIDDEN_LOCATION_ID);
    const located = sheet!.edgeGroups.find((gr) => gr.predicate === "located_at");
    expect(located).toBeDefined();
    expect(located!.items.every((i) => i.targetObjectId !== HIDDEN_LOCATION_ID)).toBe(true);
  });

  test("2. Ask FYD: business-scoped and location-scoped questions disclose nothing", () => {
    const g = hostileGraph();
    const bundle = bundleFor(g);
    const deps = { loadBundle: (id: string) => (id === "test-hostile" ? bundle : null) };
    for (const question of [
      "What is the business address?",
      "Where is the headquarters?",
      "What is the street address?",
    ]) {
      const out = answerAskFyd(
        { siteId: "test-hostile", objectId: COPPER_BUSINESS, question, mode: "visitor" },
        deps,
      );
      const text = JSON.stringify(out);
      expect(text).not.toContain(HIDDEN_ADDRESS);
    }
    // Direct attack on the hidden object id fails closed as unknown_object.
    const direct = answerAskFyd(
      { siteId: "test-hostile", objectId: HIDDEN_LOCATION_ID, question: "What is the address?", mode: "visitor" },
      deps,
    );
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.kind).toBe("unknown_object");
    expect(JSON.stringify(direct)).not.toContain(HIDDEN_ADDRESS);
  });

  test("3. search: query resolution never returns the hidden object", () => {
    const g = hostileGraph();
    const queries: FYDQuery[] = [
      { kind: "all" },
      { kind: "all", schemas: ["ping.social.location@1"] },
      { kind: "related", from: COPPER_BUSINESS, predicate: "located_at" },
      { kind: "reference", objectIds: [HIDDEN_LOCATION_ID] },
      { kind: "owner" },
    ];
    for (const q of queries) {
      const results = resolveQuery(q, g, COPPER_BUSINESS);
      expect(results.every((o) => o.id !== HIDDEN_LOCATION_ID)).toBe(true);
      expect(JSON.stringify(results)).not.toContain(HIDDEN_ADDRESS);
    }
  });

  test("4. related-object traversal: no visible object leads to the hidden one", () => {
    const g = hostileGraph();
    const visibleIds = applyPublicVisibilityGate(g).objects.map((o) => o.id);
    for (const id of visibleIds) {
      const sheet = buildObjectSheet(verify(g), id, EDGE_VISITOR);
      expect(sheet).not.toBeNull();
      const text = JSON.stringify(sheet);
      expect(text).not.toContain(HIDDEN_ADDRESS);
      expect(text).not.toContain(HIDDEN_LOCATION_ID);
    }
  });

  test("5. why-this gate: the hidden object is unresolvable", () => {
    const g = hostileGraph();
    const visible = applyPublicVisibilityGate(g);
    const byId = new Map(visible.objects.map((o) => [o.id, o]));
    // The gate the /api/fyd/why-this route applies: absent -> found:false.
    expect(byId.has(HIDDEN_LOCATION_ID)).toBe(false);
    const rels = visible.relationships.filter((r) => r.object === HIDDEN_LOCATION_ID);
    expect(rels).toHaveLength(0);
  });

  test("control: the fact survives hiding (policy, not deletion)", () => {
    const g = hostileGraph();
    const raw = g.objects.find((o) => o.id === HIDDEN_LOCATION_ID);
    expect(raw).toBeDefined();
    expect(raw!.visibility).toBe("private");
    expect(raw!.fields["street_address"]).toBe(HIDDEN_ADDRESS);
  });
});
