/**
 * Tests for the graph-derived relationship fields on ObjectProjection
 * (people / externalIdentities / serviceRefs / locationRef) and for the
 * slug-or-ID resolver (loadObjectViewBySlugOrId).
 *
 * Loader tests read the digest-verified PING projection fixtures
 * (byte-copies of real PING dump output), never the ingestion fixtures.
 * FYD_PROJECTION_DIR points at the fixtures and FYD_OWNER_DIR at a temp
 * dir so tests never touch real demo data.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { loadObjectViewBySlugOrId } from "../by-id";
import { loadObjectView } from "../view";
import { objectViewToProjection } from "../object-projection";

import { getVerifiedPublicProjectionSync } from "../../data/ping-object-source";

/** Resolve the anonymous verified projection for a fixture slug. */
const proj = (slug: string) => getVerifiedPublicProjectionSync(slug, "anonymous");
const projOrNull = (slug: string) => {
  try {
    return proj(slug);
  } catch {
    return null;
  }
};

const PROJECTIONS = join(__dirname, "fixtures", "projections");

const HAPPY = {
  site: "happy-place",
  business: "website-business-6fa5ebd99d72c4cb",
  location: "website-business-6fa5ebd99d72c4cb-location",
  service: "website-service-51de038c1defe8bd",
};
const COPPER = {
  site: "coppersmith-plumbing",
  business: "website-business-2f1327c09d622175",
  person: "website-business-2f1327c09d622175-person-377048d67856",
  ext: "website-business-2f1327c09d622175-ext-89604af059c2",
  location: "website-business-2f1327c09d622175-location",
};

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-projrel-test-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

describe("loadObjectViewBySlugOrId", () => {
  test("resolves a site slug to the business view", () => {
    const found = loadObjectViewBySlugOrId("happy-place", projOrNull);
    expect(found).not.toBeNull();
    expect(found!.siteId).toBe("happy-place");
    // Slug views are keyed by site slug (legacy loader contract).
    expect(found!.view.id).toBe("happy-place");
    expect(found!.view.name).toBe("Happy Place Carpentry LLC");
  });

  test("resolves a service object id to its view and tenant", () => {
    const found = loadObjectViewBySlugOrId(HAPPY.service, projOrNull);
    expect(found).not.toBeNull();
    expect(found!.siteId).toBe("happy-place");
    expect(found!.view.id).toBe(HAPPY.service);
  });

  test("resolves a coppersmith person id without crossing tenants", () => {
    const found = loadObjectViewBySlugOrId(COPPER.person, projOrNull);
    expect(found).not.toBeNull();
    expect(found!.siteId).toBe("coppersmith-plumbing");
    expect(found!.view.id).toBe(COPPER.person);
  });

  test("returns null for an unknown slug or id", () => {
    expect(loadObjectViewBySlugOrId("no-such-site", projOrNull)).toBeNull();
    expect(loadObjectViewBySlugOrId("website-nope-123", projOrNull)).toBeNull();
  });
});

describe("objectViewToProjection relationship fields", () => {
  test("happy-place: location and service refs from real active edges", () => {
    const view = loadObjectView(proj("happy-place"), "happy-place")!;
    const { graph } = getPingObjectGraphSync("happy-place");
    const p = objectViewToProjection(view, graph);

    expect(p.locationRef).not.toBeNull();
    expect(p.locationRef!.id).toBe(HAPPY.location);
    expect(p.locationRef!.name).toBe("Adair Village, OR, US");
    expect(p.locationRef!.relation).toBe("Located at");

    // The pergola service is visible by default, so it surfaces as a ref.
    expect(p.serviceRefs.map((r) => r.id)).toEqual([HAPPY.service]);
    expect(p.serviceRefs[0].name).toBe("Pergola Design Consultations");
    expect(p.serviceRefs[0].relation).toBe("Provides");

    // No works_for / links_to edges in the happy-place fixture.
    expect(p.people).toEqual([]);
    expect(p.externalIdentities).toEqual([]);
  });

  test("coppersmith: person, external identity, and location from real edges", () => {
    const view = loadObjectView(proj("coppersmith-plumbing"), "coppersmith-plumbing")!;
    const { graph } = getPingObjectGraphSync("coppersmith-plumbing");
    const p = objectViewToProjection(view, graph);

    // The person edge is works_for (direction in); the name is the
    // website-claimed handle, never a verified employee claim.
    expect(p.people.map((r) => r.id)).toEqual([COPPER.person]);
    expect(p.people[0].name).toBe("coppersmithplm");
    expect(p.people[0].kindLabel).toBe("Person");
    expect(p.people[0].relation).toBe("Works for");

    // Two-hop external identity via the person: person -> links_to -> ext.
    expect(p.externalIdentities.map((r) => r.id)).toEqual([COPPER.ext]);
    expect(p.externalIdentities[0].name).toBe("coppersmithplumbing.com");
    expect(p.externalIdentities[0].relation).toBe("Linked profile");

    expect(p.locationRef).not.toBeNull();
    expect(p.locationRef!.id).toBe(COPPER.location);
    expect(p.locationRef!.name).toBe(
      "Grand Junction, Colorado, 81501, United States",
    );

    // No provides/offers edges in the coppersmith fixture.
    expect(p.serviceRefs).toEqual([]);
  });

  test("without a graph the fields stay empty, exactly as before", () => {
    const view = loadObjectView(proj("happy-place"), "happy-place")!;
    const p = objectViewToProjection(view);
    expect(p.people).toEqual([]);
    expect(p.externalIdentities).toEqual([]);
    expect(p.serviceRefs).toEqual([]);
    expect(p.locationRef).toBeNull();
  });

  test("owner visibility wins: hidden services never surface as refs", () => {
    const view = loadObjectView(proj("happy-place"), "happy-place")!;
    const { graph } = getPingObjectGraphSync("happy-place");
    const hidden = {
      ...view,
      services: view.services.map((s) => ({ ...s, visible: false })),
    };
    const p = objectViewToProjection(hidden, graph);
    expect(p.serviceRefs).toEqual([]);
    // The location ref is unaffected by service visibility.
    expect(p.locationRef).not.toBeNull();
  });
});
