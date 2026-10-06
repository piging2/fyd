/**
 * EDGE-1 resolve tests (ported): the object sheet builder.
 *
 * Proves, on two fixture graphs with ZERO business-name conditionals:
 * - every edge item maps to a real object id (the invariant)
 * - edge-kind resolution from (predicate, target schema)
 * - unknown predicates fall through to generic_edge (never a dead end)
 * - capability-resolved actions only (no invented buttons)
 * - deterministic ordering
 * - claim classification on summary and claims
 * - the visibility gate: hidden objects yield null (the HTTP layer maps
 *   null to 404, indistinguishable from "unknown")
 * - the gate is exactly the rule the /sites pages use
 *   (spec-pipeline.publicGraph parity)
 *
 * Fixtures are self-contained (machine-shaped, predicate vocabulary
 * only). A second suite runs the same invariant checks against the REAL
 * PING projections when they are present on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildObjectSheet,
  resolveEdgeKind,
  predicateLabel,
  applyPublicVisibilityGate,
  EDGE_VISITOR,
} from "../resolve";
import { verifyPublicProjection } from "../../sitespec/public-projection";
import { EDGE_RENDER_INVARIANT } from "../types";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject, PingRelationship } from "@/lib/ping/types";

const BIZ = "test-business-0001";
const SVC_A = "test-service-0001";
const SVC_B = "test-service-0002";
const LOC = "test-location-0001";
const PERSON = "test-person-0001";
const EXT = "test-external-0001";

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
    evidenceRef: "test-evidence:" + id,
  };
}

/** Two graphs, same shapes, different data: the port serves both. */
function fixtureGraph(variant: "alpha" | "beta"): ObjectGraph {
  const suffix = variant === "alpha" ? "A" : "B";
  return {
    objects: [
      obj(BIZ, "ping.social.business@1", "Alpha " + suffix + " Business", {
        website: "https://example.test/",
      }),
      obj(SVC_A, "ping.social.service@1", "Service One " + suffix),
      obj(SVC_B, "ping.social.service@1", "Service Two " + suffix),
      obj(LOC, "ping.social.location@1", "Shop Location " + suffix, {
        street_address: "123 Test St",
      }),
      obj(PERSON, "ping.social.person@1", "Owner Person " + suffix),
      obj(EXT, "ping.social.external_identity@1", "External Profile " + suffix),
      obj("test-thing-0001", "ping.social.thing@1", "Mystery Thing " + suffix),
      obj(
        "test-private-0001",
        "ping.social.location@1",
        "Private Warehouse " + suffix,
        { street_address: "999 Secret Rd" },
        "private",
      ),
    ],
    relationships: [
      rel("r1", BIZ, "offers", SVC_A),
      rel("r2", BIZ, "offers", SVC_B),
      rel("r3", BIZ, "located_at", LOC),
      rel("r4", PERSON, "works_for", BIZ),
      rel("r5", BIZ, "links_to", EXT),
      rel("r6", BIZ, "located_at", "test-private-0001"),
      rel("r7", BIZ, "frobnicate", "test-thing-0001"), // unknown predicate + unknown role
      rel("r8", BIZ, "offers", SVC_B, "inactive"), // revoked edge
    ],
  };
}


/** Wrap a raw fixture graph in the anonymous verified projection.
 *  Every sheet under test now runs through the Q-C-01 boundary. */
const verify = (graph: ObjectGraph) => verifyPublicProjection(graph, [], "anonymous");

describe("the invariant is written down", () => {
  test("EDGE_RENDER_INVARIANT names the functional doorway", () => {
    expect(EDGE_RENDER_INVARIANT).toContain("FUNCTIONAL DOORWAY");
    expect(EDGE_RENDER_INVARIANT).toContain("AUTHORIZED BUSINESS GRAPH");
  });
});

describe.each([["alpha"], ["beta"]])(
  "business sheet (%s): same system, different data",
  (variant) => {
    const graph = () => fixtureGraph(variant as "alpha" | "beta");

    test("sheet resolves with identity, type, summary, edges, actions", () => {
      const sheet = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR);
      expect(sheet).not.toBeNull();
      const s = sheet!;
      expect(s.objectId).toBe(BIZ);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.typeLabel).toBe("Business");
      expect(s.schemaRole).toBe("business");
      expect(s.summary.length).toBeGreaterThan(0);
      expect(s.edgeGroups.length).toBeGreaterThan(0);
      expect(s.actions.length).toBeGreaterThan(0);
      expect(s.visibility).toBe("public");
    });

    test("offers group holds the services, each a real doorway", () => {
      const g = graph();
      const s = buildObjectSheet(verify(g), BIZ, EDGE_VISITOR)!;
      const offers = s.edgeGroups.find((gr) => gr.predicate === "offers");
      expect(offers).toBeDefined();
      // r8 is inactive: the offers group holds exactly the 2 active edges.
      expect(offers!.totalCount).toBe(2);
      const byId = new Map(g.objects.map((o) => [o.id, o]));
      for (const item of offers!.items) {
        // INVARIANT: every edge item maps to a real object id.
        const target = byId.get(item.targetObjectId);
        expect(target).toBeDefined();
        expect(item.kind).toBe("service_edge");
        expect(item.evidenceRef.length).toBeGreaterThan(0);
      }
    });

    test("unknown predicate falls through to generic_edge, never dropped", () => {
      const s = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR)!;
      const frob = s.edgeGroups.find((gr) => gr.predicate === "frobnicate");
      expect(frob).toBeDefined();
      expect(frob!.items.length).toBe(1);
      expect(frob!.items[0].kind).toBe("generic_edge");
      expect(frob!.items[0].targetObjectId).toBe("test-thing-0001");
    });

    test("private objects never appear: no sheet, no edge item", () => {
      const g = graph();
      expect(buildObjectSheet(verify(g), "test-private-0001", EDGE_VISITOR)).toBeNull();
      const s = buildObjectSheet(verify(g), BIZ, EDGE_VISITOR)!;
      const located = s.edgeGroups.find((gr) => gr.predicate === "located_at");
      expect(located).toBeDefined();
      // Only the public location; the private warehouse is gated out.
      expect(located!.totalCount).toBe(1);
      expect(located!.items[0].targetObjectId).toBe(LOC);
      const serialized = JSON.stringify(s);
      expect(serialized).not.toContain("999 Secret Rd");
      expect(serialized).not.toContain("test-private-0001");
    });

    test("edge groups are deterministically ordered", () => {
      const a = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR)!;
      const b = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR)!;
      expect(a.edgeGroups.map((gr) => gr.predicate)).toEqual(
        b.edgeGroups.map((gr) => gr.predicate),
      );
      // offers first (priority), then the rest by priority/alphabetical.
      expect(a.edgeGroups[0].predicate).toBe("offers");
    });

    test("actions resolve through the capability path; none invented", () => {
      const s = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR)!;
      const kinds = s.actions.map((a) => a.kind);
      expect(kinds).toContain("ask");
      expect(kinds).toContain("why_this");
      expect(kinds).toContain("open_full_node");
      expect(kinds).toContain("reference");
      for (const a of s.actions) {
        expect(a.capability.length).toBeGreaterThan(0);
      }
    });

    test("claims are classified; internal keys never render", () => {
      const s = buildObjectSheet(verify(graph()), BIZ, EDGE_VISITOR)!;
      for (const c of s.claims) {
        expect(["DIRECT_FACT", "DERIVED_FACT", "OWNER_AUTHORED", "GENERATED_COPY"]).toContain(
          c.claimClass,
        );
      }
      const labels = s.claims.map((c) => c.label);
      expect(labels).not.toContain("claimKind");
      expect(labels).not.toContain("source_url");
    });
  },
);

describe("resolveEdgeKind", () => {
  test("predicate + schema role decide", () => {
    expect(resolveEdgeKind("offers", "ping.social.service@1")).toBe("service_edge");
    expect(resolveEdgeKind("located_at", "ping.social.location@1")).toBe("location_edge");
    expect(resolveEdgeKind("works_for", "ping.social.person@1")).toBe("person_edge");
    expect(resolveEdgeKind("links_to", "ping.social.external_identity@1")).toBe(
      "external_identity_edge",
    );
    expect(resolveEdgeKind("offers", "ping.social.business@1")).toBe("business_edge");
  });
  test("person predicate wins over schema role", () => {
    expect(resolveEdgeKind("works_for", "ping.social.business@1")).toBe("person_edge");
  });
});

describe("predicateLabel", () => {
  test("vocabulary labels, no business names", () => {
    expect(predicateLabel("offers")).toBe("Services offered");
    expect(predicateLabel("located_at")).toBe("Location");
    expect(predicateLabel("frobnicate")).toBe("Frobnicate");
  });
});

describe("visibility gate parity", () => {
  test("the gate is idempotent over the verified anonymous projection", () => {
    // The /sites pages consume the verified projection's graph directly.
    // The edge lane re-applies the gate idempotently over that graph;
    // it must change nothing the boundary already authorized.
    const g = fixtureGraph("alpha");
    const verified = verify(g);
    expect(applyPublicVisibilityGate(verified.graph)).toEqual(verified.graph);
    // And the gate alone enforces the same object set as the boundary.
    const gatedIds = new Set(applyPublicVisibilityGate(g).objects.map((o) => o.id));
    const boundaryIds = new Set(verified.graph.objects.map((o) => o.id));
    expect(gatedIds).toEqual(boundaryIds);
  });
});

describe("real PING projections (when present)", () => {
  const dir = "/home/nolan/ping/var/fyd-projections";
  const sites = ["happy-place", "coppersmith-plumbing"];
  for (const siteId of sites) {
    test(`${siteId}: business sheet builds from the real projection shape`, () => {
      const path = join(dir, siteId + ".json");
      if (!existsSync(path)) {
        console.warn(`skip: no projection at ${path}`);
        return;
      }
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const graph: ObjectGraph = raw.graph ?? raw;
      const biz = graph.objects.find(
        (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
      );
      expect(biz).toBeDefined();
      const sheet = buildObjectSheet(verify(graph), biz!.id, EDGE_VISITOR);
      expect(sheet).not.toBeNull();
      expect(sheet!.title).toBe(biz!.title);
      // INVARIANT on real data: every edge item is a real doorway.
      const byId = new Set(graph.objects.map((o) => o.id));
      for (const grp of sheet!.edgeGroups) {
        for (const item of grp.items) {
          expect(byId.has(item.targetObjectId)).toBe(true);
        }
      }
    });
  }
});
