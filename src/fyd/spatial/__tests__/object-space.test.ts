/**
 * Tests for the FYD spatial object-space layout (pure module).
 *
 * Hand-built projections mirror the live happy-place projection values
 * verified 2026-09-22 (service ids/order, location, contact, provenance
 * ref). One describe block goes through the real by-id loader seam
 * against the committed dump-format fixtures to prove the projection
 * shape the lane consumes.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveSpatialSpec,
  toViewport,
  keyboardOrder,
} from "../object-space";
import type { SpatialNode } from "../object-space";
import type {
  ClaimEvidence,
  Fact,
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";
import { loadObjectViewBySlugOrId } from "@/fyd/object/by-id";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";

const PROVENANCE_REF =
  "website-ingestion:https://happy-place-platform.vercel.app/";
/** Private-visibility service in the live graph; the projection gates it. */
const PRIVATE_SERVICE_ID = "website-service-51de038c1d";

const BIZ_ID = "happy-place";
const LOCATION_ID = "website-business-6fa5ebd99d72c4cb-location";
const REPAIRS_ID = "website-business-6fa5ebd99d72c4cb-service-3263502c8175";
const FENCING_ID = "website-business-6fa5ebd99d72c4cb-service-340c39513223";

function observed(value: string): Fact {
  const evidence: ClaimEvidence = {
    state: "observed",
    receipt: "happyplacecarpentry.com",
  };
  return { label: "fact", value, evidence };
}

function serviceRef(id: string, name: string): RelatedRef {
  return {
    id,
    name,
    kindLabel: "Service",
    relation: "Offers",
    evidence: { state: "observed" },
  };
}

function baseProjection(overrides: Partial<ObjectProjection>): ObjectProjection {
  return {
    id: BIZ_ID,
    schema: "ping.social.business@1",
    kindLabel: "Business",
    name: "Happy Place Carpentry LLC",
    category: null,
    location: null,
    summary: null,
    facts: [],
    people: [],
    externalIdentities: [],
    serviceRefs: [],
    locationRef: null,
    contact: { phone: null, email: null, website: null },
    capabilities: [],
    provenance: {
      label: "Information observed on happyplacecarpentry.com",
      ref: PROVENANCE_REF,
      derivedAt: "2026-09-22T14:50:58Z",
    },
    sampleQuestions: [],
    ownerUpdatedAt: null,
    media: [],
    ...overrides,
  };
}

/** Business projection mirroring the live projection (verified 2026-09-22). */
function happyPlaceBusiness(): ObjectProjection {
  return baseProjection({
    serviceRefs: [
      serviceRef(REPAIRS_ID, "Repairs"),
      serviceRef(FENCING_ID, "Fencing"),
      serviceRef(
        "website-business-6fa5ebd99d72c4cb-service-7f1139c11dab",
        "Painting",
      ),
      serviceRef(
        "website-business-6fa5ebd99d72c4cb-service-c63c87ed8420",
        "Drywall",
      ),
      serviceRef(
        "website-business-6fa5ebd99d72c4cb-service-cd28e52699a5",
        "Restoration",
      ),
    ],
    locationRef: {
      id: LOCATION_ID,
      name: "Adair Village, OR, US",
      kindLabel: "Location",
      relation: "Located at",
      evidence: { state: "observed" },
    },
    contact: {
      phone: observed("+15412865190"),
      email: observed("taylor@happyplacecarpentry.com"),
      website: observed("https://happyplacecarpentry.com"),
    },
  });
}

/** Service projection mirroring the live Repairs projection (no own contact). */
function repairsService(): ObjectProjection {
  return baseProjection({
    id: REPAIRS_ID,
    schema: "ping.social.service@1",
    kindLabel: "Service",
    name: "Repairs",
  });
}

function rolesOf(nodes: SpatialNode[]): string[] {
  return nodes.map((n) => n.role);
}

describe("deriveSpatialSpec / business focus", () => {
  test("center is happy-place with 6 satellites in priority order", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    expect(spec).not.toBeNull();
    expect(spec!.focusedObjectId).toBe("happy-place");
    expect(spec!.focusKind).toBe("business");
    expect(spec!.nodes).toHaveLength(7);

    const [center, ...satellites] = spec!.nodes;
    expect(center.role).toBe("center");
    expect(center.objectId).toBe("happy-place");
    expect(center.label).toBe("Happy Place Carpentry LLC");
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
    expect(center.priority).toBe(0);

    expect(rolesOf(satellites)).toEqual([
      "service",
      "service",
      "location",
      "contact",
      "evidence",
      "ask",
    ]);
    expect(satellites[0].objectId).toBe(REPAIRS_ID);
    expect(satellites[0].label).toBe("Repairs");
    expect(satellites[1].objectId).toBe(FENCING_ID);
    expect(satellites[1].label).toBe("Fencing");
    expect(satellites[2].objectId).toBe(LOCATION_ID);
    expect(satellites[3].role).toBe("contact");
    expect(satellites[4].role).toBe("evidence");
    expect(satellites[4].evidenceRef).toBe(PROVENANCE_REF);
    expect(satellites[5].objectId).toBe("ask-fyd");
    expect(satellites[5].label).toBe("Ask FYD");

    // Priorities strictly increase: center 0, satellites 1..6.
    expect(spec!.nodes.map((n) => n.priority)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("only the first two serviceRefs become satellites", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const serviceNodes = spec!.nodes.filter((n) => n.role === "service");
    expect(serviceNodes).toHaveLength(2);
    expect(serviceNodes.map((n) => n.label)).toEqual(["Repairs", "Fencing"]);
  });

  test("satellites sit on the 0.68 orbit starting at the top", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const satellites = spec!.nodes.slice(1);
    for (const s of satellites) {
      expect(Math.hypot(s.x, s.y)).toBeCloseTo(0.68, 10);
      expect(s.radius).toBe(0.16);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(1);
    }
    // First satellite at -90deg: top of the orbit.
    expect(satellites[0].x).toBeCloseTo(0, 10);
    expect(satellites[0].y).toBeCloseTo(-0.68, 10);
    // First satellite emphasized, the rest neutral.
    expect(satellites[0].scale).toBe(1.1);
    for (const s of satellites.slice(1)) expect(s.scale).toBe(1);
  });

  test("private-visibility service never appears as a satellite", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const ids = spec!.nodes.map((n) => n.objectId);
    expect(ids).not.toContain(PRIVATE_SERVICE_ID);
    // The layer only emits what the (already gated) projection handed it:
    // the first two serviceRefs, nothing else.
    const serviceIds = spec!.nodes
      .filter((n) => n.role === "service")
      .map((n) => n.objectId);
    expect(serviceIds).toEqual(
      happyPlaceBusiness().serviceRefs.slice(0, 2).map((r) => r.id),
    );
  });

  test("null locationRef skips the location satellite", () => {
    const spec = deriveSpatialSpec({
      focus: baseProjection({
        serviceRefs: [serviceRef(REPAIRS_ID, "Repairs")],
        locationRef: null,
        contact: {
          phone: observed("+15412865190"),
          email: null,
          website: null,
        },
      }),
    });
    expect(rolesOf(spec!.nodes.slice(1))).toEqual([
      "service",
      "contact",
      "evidence",
      "ask",
    ]);
  });

  test("empty contact skips the contact satellite", () => {
    const spec = deriveSpatialSpec({
      focus: baseProjection({
        serviceRefs: [serviceRef(REPAIRS_ID, "Repairs")],
      }),
    });
    expect(rolesOf(spec!.nodes)).not.toContain("contact");
  });

  test("deterministic: two calls produce deep-equal specs", () => {
    const a = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const b = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("deriveSpatialSpec / service focus", () => {
  test("service center with receding parent, evidence, ask, contact", () => {
    const parent = happyPlaceBusiness();
    const spec = deriveSpatialSpec({ focus: repairsService(), parent });
    expect(spec).not.toBeNull();
    expect(spec!.focusedObjectId).toBe(REPAIRS_ID);
    expect(spec!.focusKind).toBe("service");

    const [center, ...satellites] = spec!.nodes;
    expect(center.role).toBe("center");
    expect(center.objectId).toBe(REPAIRS_ID);
    expect(center.label).toBe("Repairs");

    // The service carries no contact of its own; the contact satellite
    // falls back to the parent business contact.
    expect(rolesOf(satellites)).toEqual(["parent", "evidence", "ask", "contact"]);
    expect(satellites[0].objectId).toBe("happy-place");
    expect(satellites[0].label).toBe("Happy Place Carpentry LLC");
    expect(satellites[0].scale).toBe(0.85);
    expect(satellites[1].evidenceRef).toBe(PROVENANCE_REF);
    expect(satellites[2].objectId).toBe("ask-fyd");
    expect(satellites[3].role).toBe("contact");
  });

  test("service focus without a parent has no parent satellite", () => {
    const spec = deriveSpatialSpec({ focus: repairsService() });
    expect(rolesOf(spec!.nodes.slice(1))).toEqual(["evidence", "ask"]);
  });
});

describe("deriveSpatialSpec / fail-closed", () => {
  test("null or missing focus returns null", () => {
    expect(deriveSpatialSpec({ focus: null })).toBeNull();
    expect(deriveSpatialSpec({ focus: undefined })).toBeNull();
    expect(deriveSpatialSpec({} as { focus: ObjectProjection })).toBeNull();
  });

  test("empty focus id returns null", () => {
    expect(
      deriveSpatialSpec({ focus: baseProjection({ id: "" }) }),
    ).toBeNull();
  });
});

describe("deriveSpatialSpec / by-id loader (real projection seam)", () => {
  const FIXTURES = join(
    __dirname,
    "..",
    "..",
    "object",
    "__tests__",
    "fixtures",
    "projections",
  );
  const FIXTURE_SERVICE = "website-service-51de038c1defe8bd";

  beforeEach(() => {
    process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-spatial-test-"));
    process.env.FYD_PROJECTION_DIR = FIXTURES;
  });

  function projectionFor(objectId: string): ObjectProjection {
    const resolved = loadObjectViewBySlugOrId(objectId);
    expect(resolved).not.toBeNull();
    const graph = getPingObjectGraphSync(resolved!.siteId).graph;
    return objectViewToProjection(resolved!.view, graph);
  }

  test("business focus through the loader", () => {
    const proj = projectionFor("happy-place");
    const spec = deriveSpatialSpec({ focus: proj });
    expect(spec).not.toBeNull();
    expect(spec!.focusKind).toBe("business");
    expect(spec!.nodes[0].objectId).toBe("happy-place");
    expect(spec!.nodes[0].role).toBe("center");
    const firstSat = spec!.nodes[1];
    expect(firstSat.role).toBe("service");
    expect(firstSat.objectId).toBe(proj.serviceRefs[0].id);
  });

  test("service focus through the loader with parent business", () => {
    const svc = projectionFor(FIXTURE_SERVICE);
    expect(svc.kindLabel).toBe("Service");
    const parent = projectionFor("happy-place");
    const spec = deriveSpatialSpec({ focus: svc, parent });
    expect(spec).not.toBeNull();
    expect(spec!.focusKind).toBe("service");
    expect(spec!.nodes[0].objectId).toBe(FIXTURE_SERVICE);
    const parentSat = spec!.nodes[1];
    expect(parentSat.role).toBe("parent");
    expect(parentSat.label).toBe(parent.name);
  });
});

describe("toViewport", () => {
  const vp = { w: 800, h: 600 }; // cx=400, cy=300, unit=300

  function node(overrides: Partial<SpatialNode>): SpatialNode {
    return {
      objectId: "n",
      role: "service",
      label: "N",
      x: 0,
      y: 0,
      radius: 0.16,
      scale: 1,
      priority: 1,
      ...overrides,
    };
  }

  test("center maps to the canvas center with scaled radius", () => {
    const out = toViewport(
      node({ role: "center", radius: 0.3, scale: 1 }),
      vp,
    );
    expect(out.x).toBe(400);
    expect(out.y).toBe(300);
    expect(out.r).toBeCloseTo(90, 10);
  });

  test("satellite offset and radius scale with unit and node scale", () => {
    const out = toViewport(node({ x: 0, y: -0.68, scale: 1.1 }), vp);
    expect(out.x).toBeCloseTo(400, 10);
    expect(out.y).toBeCloseTo(96, 10);
    expect(out.r).toBeCloseTo(0.16 * 300 * 1.1, 10);
  });

  test("uses the min dimension for non-square viewports", () => {
    const out = toViewport(node({ x: 1, y: 1, radius: 0.5 }), {
      w: 400,
      h: 900,
    });
    expect(out.x).toBe(400);
    expect(out.y).toBe(650);
    expect(out.r).toBe(100);
  });

  test("first satellite of a real spec lands at the top of the orbit", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const out = toViewport(spec!.nodes[1], vp);
    expect(out.x).toBeCloseTo(400, 8);
    expect(out.y).toBeCloseTo(300 - 0.68 * 300, 8);
  });
});

describe("keyboardOrder", () => {
  test("matches priority order", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const shuffled = [...spec!.nodes].reverse();
    const ordered = keyboardOrder({ ...spec!, nodes: shuffled });
    expect(ordered.map((n) => n.priority)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ordered[0].role).toBe("center");
  });

  test("does not mutate the spec nodes", () => {
    const spec = deriveSpatialSpec({ focus: happyPlaceBusiness() });
    const before = spec!.nodes.map((n) => n.objectId);
    keyboardOrder(spec!);
    expect(spec!.nodes.map((n) => n.objectId)).toEqual(before);
  });
});
