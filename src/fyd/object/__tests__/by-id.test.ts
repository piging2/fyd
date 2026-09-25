/**
 * Tests for the per-object projection path: loadObjectViewById,
 * loadCircleProjectionById (../by-id), and the ObjectView ->
 * CircleProjection adapter (../circle-adapter).
 *
 * Loader tests read the digest-verified PING projection fixtures
 * (byte-copies of real PING dump output), never the ingestion fixtures.
 * FYD_PROJECTION_DIR points at the fixtures and FYD_OWNER_DIR at a temp
 * dir so tests never touch real demo data. Run from the repo root so
 * media manifests resolve via process.cwd().
 *
 * Adapter tests are pure unit tests over hand-built ObjectViews: they pin
 * the evidence-preserving contract (field mapping, gradient determinism,
 * no media invention) without any I/O.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCircleProjectionById, loadObjectViewById } from "../by-id";
import { objectViewToCircleProjection } from "../circle-adapter";
import type {
  ObjectContactView,
  ObjectMediaView,
  ObjectServiceView,
  ObjectView,
} from "../types";
import { getVerifiedPublicProjectionSync } from "../../data/ping-object-source";
/** Anonymous verified projection for a fixture slug (null when unknown). */
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
};

beforeEach(() => {
  // Isolate owner state so tests never touch real demo data, and point the
  // PING-backed source at the test projections.
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-byid-test-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

/**
 * Canonical JSON for digest recomputation: recursive key sort, array
 * order preserved. Mirrors src/lib/ping/ask-composer.ts canonicalize.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(",")}}`;
  }
  return "null";
}

/**
 * A hostile projection: the happy-place fixture plus one PRIVATE object,
 * digest recomputed so verification passes. The loader must still refuse
 * to serve the private object.
 */
function projectionDirWithPrivateObject(): string {
  const dir = mkdtempSync(join(tmpdir(), "fyd-byid-hostile-"));
  const doc = JSON.parse(
    readFileSync(join(PROJECTIONS, "happy-place.json"), "utf8"),
  ) as { graph: { objects: unknown[] }; meta: { graphDigest: string } };
  doc.graph.objects.push({
    id: "secret-service-1",
    schema: "ping.social.service@1",
    controllerId: "ctrl-1",
    visibility: "private",
    title: "Secret Service",
    description: "Not public.",
    fields: {},
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    provenance: {
      kind: "canonical-journal",
      ref: "ping-event:abc",
      derivedAt: "2026-09-21T00:00:00Z",
    },
  });
  doc.meta.graphDigest = createHash("sha256")
    .update(canonicalize(doc.graph), "utf8")
    .digest("hex");
  writeFileSync(join(dir, "happy-place.json"), JSON.stringify(doc));
  return dir;
}

describe("loadObjectViewById", () => {
  test("loads the business object by id", () => {
    const view = loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business);
    expect(view).not.toBeNull();
    expect(view!.id).toBe(HAPPY.business);
    expect(view!.schema).toBe("ping.social.business@1");
    expect(view!.name).toBe("Happy Place Carpentry LLC");
    expect(view!.category).toBe("Carpentry");
    expect(view!.locationLabel).toBe("Adair Village, OR, US");
    expect(view!.summary).toContain("Licensed Oregon carpentry contractor");
    expect(view!.services.map((s) => s.name)).toEqual(["Pergola Design Consultations"]);
    expect(view!.services[0].basis).toBe("structured");
    // Happy Place's homepage exposes no acquirable business imagery: the
    // read model shows no media rather than inventing any.
    expect(view!.media).toEqual([]);
  });

  test("loads the location object by id", () => {
    const view = loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.location);
    expect(view).not.toBeNull();
    expect(view!.id).toBe(HAPPY.location);
    expect(view!.schema).toBe("ping.social.location@1");
    expect(view!.name).toBe("Adair Village, OR, US");
    expect(view!.locationLabel).toBe("Adair Village, OR, US");
    expect(view!.summary).toBe(
      "Coarse public location claim from the website's structured data.",
    );
    // No keywords on the location: category stays null, never guessed.
    expect(view!.category).toBeNull();
    // A location provides no services.
    expect(view!.services).toEqual([]);
  });

  test("loads the service object by id", () => {
    const view = loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.service);
    expect(view).not.toBeNull();
    expect(view!.id).toBe(HAPPY.service);
    expect(view!.schema).toBe("ping.social.service@1");
    expect(view!.name).toBe("Pergola Design Consultations");
    expect(view!.summary).toContain("On-site pergola design consultations");
    expect(view!.category).toBeNull();
    expect(view!.services).toEqual([]);
  });

  test("loads the coppersmith business by id with its acquired media", () => {
    const view = loadObjectViewById(projOrNull(COPPER.site), COPPER.site, COPPER.business);
    expect(view).not.toBeNull();
    expect(view!.id).toBe(COPPER.business);
    expect(view!.name).not.toBe("Happy Place Carpentry LLC");
    expect(view!.media.length).toBeGreaterThan(0);
    expect(view!.media.every((m) => m.rightsSource === "public-demo-source")).toBe(true);
  });

  test("returns null for an unknown tenant", () => {
    expect(loadObjectViewById(projOrNull("nope"), "nope", HAPPY.business)).toBeNull();
  });

  test("returns null for an unknown object id", () => {
    expect(loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, "nope")).toBeNull();
  });

  test("never crosses tenants", () => {
    // The coppersmith business id is not in the happy-place graph.
    expect(loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, COPPER.business)).toBeNull();
    expect(loadObjectViewById(projOrNull(COPPER.site), COPPER.site, HAPPY.business)).toBeNull();
  });

  test("returns null for a private object", () => {
    process.env.FYD_PROJECTION_DIR = projectionDirWithPrivateObject();
    expect(loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, "secret-service-1")).toBeNull();
    expect(loadCircleProjectionById(projOrNull(HAPPY.site), HAPPY.site, "secret-service-1")).toBeNull();
  });
});

describe("loadCircleProjectionById", () => {
  test("projects the business object", () => {
    const proj = loadCircleProjectionById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business);
    expect(proj).not.toBeNull();
    expect(proj!.id).toBe(HAPPY.business);
    expect(proj!.name).toBe("Happy Place Carpentry LLC");
    expect(proj!.category).toBe("Carpentry");
    expect(proj!.locationLabel).toBe("Adair Village, OR, US");
    expect(proj!.topFacts).toEqual(["Pergola Design Consultations"]);
    expect(proj!.sampleQuestions).toHaveLength(3);
    // Tagline is a 90-char word-boundary trim of the summary.
    expect(proj!.tagline.length).toBeLessThanOrEqual(90);
    expect(loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business)!.summary.startsWith(proj!.tagline)).toBe(true);
  });

  test("gradient background is deterministic and matches the media-lane convention", () => {
    const a = loadCircleProjectionById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business);
    const b = loadCircleProjectionById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business);
    expect(a).toEqual(b);
    // Independent recomputation of the sha256(objectId) gradient.
    const hash = createHash("sha256").update(HAPPY.business, "utf8").digest();
    const hue = 18 + (hash[0] % 25);
    expect(hue).toBeGreaterThanOrEqual(18);
    expect(hue).toBeLessThanOrEqual(42);
    expect(a!.background).toEqual({
      kind: "gradient",
      css:
        "radial-gradient(circle at 35% 30%, hsl(" +
        hue +
        " 45% 62%), hsl(" +
        (hue - 12) +
        " 50% 38%))",
      digest: hash.toString("hex"),
      observedAt: "",
      basis: "Deterministic fallback, no authorized site media",
    });
  });

  test("coppersmith business gets an image background from rights-authorized media", () => {
    const proj = loadCircleProjectionById(projOrNull(COPPER.site), COPPER.site, COPPER.business);
    expect(proj).not.toBeNull();
    expect(proj!.background.kind).toBe("image");
    if (proj!.background.kind === "image") {
      expect(proj!.background.src.startsWith("/fyd-media/")).toBe(true);
      expect(proj!.background.digest.length).toBeGreaterThan(0);
    }
  });

  test("honesty gates: unknown tenant / object id -> null", () => {
    expect(loadCircleProjectionById(projOrNull("nope"), "nope", HAPPY.business)).toBeNull();
    expect(loadCircleProjectionById(projOrNull(HAPPY.site), HAPPY.site, "nope")).toBeNull();
  });
});

describe("objectViewToCircleProjection", () => {
  const contact: ObjectContactView = {
    phone: null,
    email: null,
    website: null,
    locality: null,
    addressVisibility: "public",
  };

  function mediaEntry(over: Partial<ObjectMediaView>): ObjectMediaView {
    return {
      id: "m-1",
      role: "gallery",
      src: "/fyd-media/m-1.webp",
      alt: "photo",
      rightsSource: "public-demo-source",
      rightsBasis: "Demo-authorized public media",
      sourceUrl: "https://example.com/photo.jpg",
      digest: "digest-1",
      observedAt: "2026-09-21T00:00:00Z",
      ...over,
    };
  }

  function service(name: string, visible = true): ObjectServiceView {
    return {
      id: "svc-" + name,
      name,
      basis: "structured",
      basisLabel: "From the site data",
      visible,
    };
  }

  function stubView(over: Partial<ObjectView> = {}): ObjectView {
    return {
      id: "obj-1",
      schema: "ping.social.service@1",
      name: "Test Service",
      category: null,
      locationLabel: null,
      summary: "A short summary.",
      media: [],
      services: [],
      serviceArea: [],
      contact,
      capabilities: [{ kind: "ask" }, { kind: "follow" }, { kind: "like" }],
      provenance: {
        kind: "website-derived",
        ref: "website-ingestion:https://example.com/",
        derivedAt: "2026-09-21T00:00:00Z",
        label: "Information observed on example.com",
      },
      ownerUpdatedAt: null,
      sampleQuestions: ["one?", "two?", "three?", "four?"],
      fieldCorrections: [],
      ...over,
    };
  }

  test("copies scalar fields and provenance through, caps sample questions at 3", () => {
    const view = stubView({ name: "Pergola Design", category: "Carpentry" });
    const proj = objectViewToCircleProjection(view);
    expect(proj.id).toBe("obj-1");
    expect(proj.name).toBe("Pergola Design");
    expect(proj.category).toBe("Carpentry");
    expect(proj.locationLabel).toBeNull();
    expect(proj.capabilities).toEqual(view.capabilities);
    expect(proj.provenanceLabel).toBe("Information observed on example.com");
    expect(proj.provenanceDetail).toBe("website-ingestion:https://example.com/");
    expect(proj.sampleQuestions).toEqual(["one?", "two?", "three?"]);
  });

  test("tagline is a 90-char word-boundary trim; short summaries pass through", () => {
    const short = objectViewToCircleProjection(stubView({ summary: "Short." }));
    expect(short.tagline).toBe("Short.");
    const long = "alpha ".repeat(40).trim(); // 239 chars
    const proj = objectViewToCircleProjection(stubView({ summary: long }));
    expect(proj.tagline.length).toBeLessThanOrEqual(90);
    expect(long.startsWith(proj.tagline)).toBe(true);
    expect(proj.tagline.endsWith(" ")).toBe(false);
  });

  test("topFacts are the first 3 visible service names, in view order", () => {
    const view = stubView({
      services: [
        service("Alpha"),
        service("Hidden", false),
        service("Beta"),
        service("Gamma"),
        service("Delta"),
      ],
    });
    expect(objectViewToCircleProjection(view).topFacts).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  test("image background comes from the first hero/logo media entry, nothing invented", () => {
    const logo = mediaEntry({
      id: "m-logo",
      role: "logo",
      src: "/fyd-media/logo.webp",
      digest: "logo-digest",
      observedAt: "2026-09-20T00:00:00Z",
      rightsBasis: "Demo-authorized logo",
    });
    const view = stubView({ media: [mediaEntry({ id: "m-g" }), logo] });
    const proj = objectViewToCircleProjection(view);
    expect(proj.background).toEqual({
      kind: "image",
      src: "/fyd-media/logo.webp",
      digest: "logo-digest",
      observedAt: "2026-09-20T00:00:00Z",
      basis: "Demo-authorized logo",
    });
  });

  test("gallery-only media still falls back to the gradient (hero/logo rule)", () => {
    const view = stubView({ media: [mediaEntry({ role: "gallery" })] });
    const proj = objectViewToCircleProjection(view);
    expect(proj.background.kind).toBe("gradient");
  });

  test("gradient fallback is deterministic per object id and warm-hued", () => {
    const view = stubView({ id: "some-object-9" });
    const a = objectViewToCircleProjection(view);
    const b = objectViewToCircleProjection(view);
    expect(a.background).toEqual(b.background);
    expect(a.background.kind).toBe("gradient");
    if (a.background.kind === "gradient") {
      const m = a.background.css.match(/hsl\((\d+) 45% 62%\)/);
      expect(m).not.toBeNull();
      const hue = Number(m![1]);
      expect(hue).toBeGreaterThanOrEqual(18);
      expect(hue).toBeLessThanOrEqual(42);
      // Independent recomputation from sha256(view.id).
      const hash = createHash("sha256").update("some-object-9", "utf8").digest();
      expect(hue).toBe(18 + (hash[0] % 25));
      expect(a.background.digest).toBe(hash.toString("hex"));
    }
  });

  test("never invents media: no media -> gradient, never an empty image", () => {
    const proj = objectViewToCircleProjection(stubView({ media: [] }));
    expect(proj.background.kind).toBe("gradient");
    if (proj.background.kind === "image") {
      throw new Error("unreachable: kind is gradient");
    }
    expect(proj.background.css.length).toBeGreaterThan(0);
  });
});
