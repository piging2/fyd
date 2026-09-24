/**
 * Tests for the PING-backed object projection loader.
 *
 * loadObjectView reads the digest-verified PING projection read model
 * (@/fyd/data/ping-object-source), never the ingestion fixtures. The
 * fixtures under src/fyd/object/__tests__/fixtures/projections are
 * byte-copies of real PING dump output, so the loader's verification
 * (meta + graphDigest) runs for real in these tests.
 *
 * Run from the repo root so manifests resolve via process.cwd().
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCapabilities,
  buildObjectView,
  knownServices,
  listObjectIds,
  loadObjectView,
} from "../view";

const PROJECTIONS = join(__dirname, "fixtures", "projections");

beforeEach(() => {
  // Isolate owner state so tests never touch real demo data, and point the
  // PING-backed source at the test projections.
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-view-test-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

function projectionServiceTitles(slug: string): string[] {
  const doc = JSON.parse(
    readFileSync(join(PROJECTIONS, slug + ".json"), "utf8"),
  ) as {
    graph: {
      objects: { id: string; schema: string; title: string; visibility: string }[];
      relationships: {
        subject: string;
        predicate: string;
        object: string;
        status: string;
      }[];
    };
  };
  const owner = doc.graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  )!;
  const byId = new Map(doc.graph.objects.map((o) => [o.id, o]));
  return doc.graph.relationships
    .filter(
      (r) =>
        r.subject === owner.id &&
        r.status === "active" &&
        (r.predicate === "provides" || r.predicate === "offers"),
    )
    .map((r) => byId.get(r.object))
    .filter(
      (o): o is { id: string; schema: string; title: string; visibility: string } =>
        !!o && o.schema === "ping.social.service@1" && o.visibility === "public",
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => o.title);
}

describe("loadObjectView", () => {
  test("returns null for unknown objects", () => {
    expect(loadObjectView("nope")).toBeNull();
  });

  test("loads the Happy Place view from the PING-backed projection", () => {
    const view = loadObjectView("happy-place");
    expect(view).not.toBeNull();
    expect(view!.id).toBe("happy-place");
    expect(view!.schema).toBe("ping.social.business@1");
    expect(view!.name).toBe("Happy Place Carpentry LLC");
    expect(view!.category).toBe("Carpentry");
    expect(view!.locationLabel).toBe("Adair Village, OR, US");
    expect(view!.summary).toContain("Licensed Oregon carpentry contractor");
    // Services are the structured service objects from the projection.
    expect(view!.services.map((s) => s.name)).toEqual([
      "Pergola Design Consultations",
    ]);
    expect(view!.services[0].basis).toBe("structured");
    expect(view!.services[0].id).toBe("website-service-51de038c1defe8bd");
    // Capabilities only where the value exists: phone, email, website present.
    const kinds = view!.capabilities.map((c) => c.kind);
    expect(kinds).toContain("call");
    expect(kinds).toContain("email");
    expect(kinds).toContain("website");
    expect(kinds).toContain("ask");
    expect(kinds).toContain("follow");
    // "view" is demoted: the full customer page is no longer a capability.
    expect(kinds).not.toContain("view");
    // Happy Place's homepage exposes no acquirable business imagery
    // (fyd-media@2 ingest: the only observed image is an off-origin Google
    // logo, classified unclear-reference-only). The read model shows no
    // media rather than inventing any: missing data is honest, never
    // plausible demo content.
    expect(view!.media).toEqual([]);
    expect(view!.provenance.label).toContain("happyplacecarpentry.com");
  });

  test("service list agrees with the projection graph (FL-20260921-233)", () => {
    // The loader must enumerate exactly the structured services the
    // projection carries: no fixture prose-parse, no second source.
    const view = loadObjectView("happy-place");
    expect(view!.services.map((s) => s.name)).toEqual(
      projectionServiceTitles("happy-place"),
    );
    expect(projectionServiceTitles("happy-place")).toEqual([
      "Pergola Design Consultations",
    ]);
  });

  test("owner hide is reflected in the view", () => {
    const { ids, names } = knownServices("happy-place");
    expect(ids).toEqual(["website-service-51de038c1defe8bd"]);
    const { applyOwnerCommand } = require("../owner-store") as typeof import("../owner-store");
    applyOwnerCommand(
      "happy-place",
      {
        type: "set-service-visibility",
        id: "website-service-51de038c1defe8bd",
        visible: false,
      },
      ids,
      names,
    );
    const view = loadObjectView("happy-place");
    expect(
      view!.services.find((s) => s.id === "website-service-51de038c1defe8bd")!.visible,
    ).toBe(false);
  });

  test("owner-added services keep the owner basis", () => {
    const { ids, names } = knownServices("happy-place");
    const { applyOwnerCommand } = require("../owner-store") as typeof import("../owner-store");
    applyOwnerCommand("happy-place", { type: "add-service", name: "Gutter Cleaning" }, ids, names);
    const view = loadObjectView("happy-place");
    const added = view!.services.find((s) => s.name === "Gutter Cleaning")!;
    expect(added.basis).toBe("owner");
    expect(added.visible).toBe(true);
    expect(view!.ownerUpdatedAt).not.toBeNull();
  });

  test("Coppersmith loads with no structured services", () => {
    const view = loadObjectView("coppersmith-plumbing");
    expect(view).not.toBeNull();
    expect(view!.id).toBe("coppersmith-plumbing");
    expect(view!.name).not.toBe("Happy Place Carpentry LLC");
    // No service objects in the projection: no services, agreeing with the pages.
    expect(view!.services).toEqual([]);
    // Coppersmith has acquired media; every displayed item carries the
    // rights/source classification, and none is a hotlink.
    expect(view!.media.length).toBeGreaterThan(0);
    expect(view!.media.every((m) => m.rightsSource === "public-demo-source")).toBe(true);
    expect(view!.media[0].src.startsWith("/fyd-media/")).toBe(true);
  });

  test("lists the projection-backed site ids", () => {
    expect(listObjectIds().sort()).toEqual(["coppersmith-plumbing", "happy-place"]);
  });

  test("legacy buildObjectView alias still resolves", () => {
    expect(buildObjectView("happy-place")?.services.map((s) => s.name)).toEqual([
      "Pergola Design Consultations",
    ]);
  });
});

describe("buildCapabilities ask gating (Phase 2)", () => {
  const emptyContact = {
    phone: null,
    email: null,
    website: null,
    locality: null,
    addressVisibility: "hidden",
  } as const;

  test("no evidence -> no ask capability (follow/like remain)", () => {
    const caps = buildCapabilities("ping.social.business@1", "b1", emptyContact, { summary: "", services: [] });
    expect(caps.some((c) => c.kind === "ask")).toBe(false);
    expect(caps.some((c) => c.kind === "follow")).toBe(true);
    expect(caps.some((c) => c.kind === "like")).toBe(false); // business: no like
  });

  test("summary text gates ask on", () => {
    const caps = buildCapabilities("ping.social.business@1", "b1", emptyContact, {
      summary: "A real business.",
      services: [],
    });
    expect(caps.some((c) => c.kind === "ask")).toBe(true);
  });

  test("a visible service gates ask on", () => {
    const caps = buildCapabilities("ping.social.business@1", "b1", emptyContact, {
      summary: "",
      services: [
        {
          id: "s1",
          name: "Consult",
          basis: "structured",
          basisLabel: "From the site data",
          visible: true,
        },
      ],
    });
    expect(caps.some((c) => c.kind === "ask")).toBe(true);
  });

  test("service gets reference, not follow/like/contact", () => {
    const caps = buildCapabilities("ping.social.service@1", "s7", emptyContact, {
      summary: "Emergency plumbing.",
      services: [],
    });
    expect(caps.some((c) => c.kind === "ask")).toBe(true);
    expect(caps.some((c) => c.kind === "reference")).toBe(true);
    expect(caps.some((c) => c.kind === "follow")).toBe(false);
    expect(caps.some((c) => c.kind === "like")).toBe(false);
    expect(caps.some((c) => c.kind === "call")).toBe(false);
  });

  test("location with locality gets directions", () => {
    const caps = buildCapabilities(
      "ping.social.location@1",
      "l1",
      { ...emptyContact, locality: "Grand Junction, CO" },
      { summary: "", services: [] },
    );
    const dir = caps.find((c) => c.kind === "directions");
    expect(dir).toBeDefined();
    expect((dir as { href: string }).href).toContain("google.com/maps");
    expect(caps.some((c) => c.kind === "follow")).toBe(false);
  });

  test("person gets follow, post gets like", () => {
    const person = buildCapabilities("ping.social.person@1", "p1", emptyContact, {
      summary: "A tech.",
      services: [],
    });
    expect(person.some((c) => c.kind === "follow")).toBe(true);
    expect(person.some((c) => c.kind === "like")).toBe(false);
    const post = buildCapabilities("ping.social.post@1", "po1", emptyContact, {
      summary: "Hello.",
      services: [],
    });
    expect(post.some((c) => c.kind === "like")).toBe(true);
    expect(post.some((c) => c.kind === "reference")).toBe(true);
    expect(post.some((c) => c.kind === "follow")).toBe(false);
  });

  test("contact evidence gates ask on", () => {
    const caps = buildCapabilities(
      "ping.social.business@1",
      "b1",
      { ...emptyContact, phone: "+15551234567" },
      { summary: "", services: [] },
    );
    expect(caps.some((c) => c.kind === "ask")).toBe(true);
  });
});
