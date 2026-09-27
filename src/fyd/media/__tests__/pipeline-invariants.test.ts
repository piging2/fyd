/**
 * FYD media pipeline invariants (Phase 4 verification).
 *
 * These tests pin the download + digest + derivative contract against the
 * committed pipeline manifests and the derivative bytes on disk:
 * - every published manifest asset answers where it came from
 *   (provenance.sourceUrl), when it was observed (provenance.observedAt),
 *   and what bytes generated its derivatives (digest), with a recorded
 *   rights basis;
 * - every derivative variant is served FYD-local (/fyd-media/...) and the
 *   bytes on disk sha256-match the manifest entry;
 * - unacquired (rights-rejected) references never surface as media: the
 *   gstatic logo reference for happy-place is recorded rejected, and the
 *   unacquired hero URL that exists only as a reference in the business
 *   fields never becomes a src;
 * - demo-authorized acquisition (Nolan 2026-09-25): happy-place media
 *   exists ONLY for the five explicitly demo-authorized sources, each
 *   carrying the demo authorization basis, full provenance, digest, and
 *   FYD-local derivatives;
 * - end to end: loadObjectViewById(projection, "coppersmith-plumbing", businessId)
 *   lists all 11 assets with local srcs, and the circle adapter picks the
 *   logo/hero derivative for the background.
 *
 * Run from the repo root so manifests resolve via process.cwd():
 * npx jest --config src/fyd/media/jest.config.cjs
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import { loadObjectViewById } from "../../object/by-id";
import { objectViewToCircleProjection } from "../../object/circle-adapter";
import {
  getMediaManifest,
  getPipelineManifest,
  validatePipelineManifest,
} from "../bundle-media";
import { resolveCircleBackground } from "../circle-background";
import { heroMediaFor, listObjectMedia } from "../select";
import { isAcquirable, MEDIA_MODULE_VERSION } from "../types";

/** Anonymous verified projection for a fixture slug (null when unknown). */
const projOrNull = (slug: string) => {
  try {
    return getVerifiedPublicProjectionSync(slug, "anonymous");
  } catch {
    return null;
  }
};

const PROJECTIONS = join(
  __dirname,
  "..",
  "..",
  "object",
  "__tests__",
  "fixtures",
  "projections",
);

const COPPER = {
  site: "coppersmith-plumbing",
  business: "website-business-2f1327c09d622175",
};
const HAPPY = {
  site: "happy-place",
  business: "website-business-6fa5ebd99d72c4cb",
};
/** Exists only as an unacquired reference in the happy-place business fields. */
const HAPPY_UNACQUIRED_HERO =
  "https://happyplacecarpentry.com/images/hero-background-enhanced.jpg";

const HEX64 = /^[0-9a-f]{64}$/;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-media-inv-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

describe("committed manifest provenance + rights invariants", () => {
  test("coppersmith: all 11 assets carry sourceUrl + observedAt + digest + rights", () => {
    const manifest = getPipelineManifest(COPPER.site);
    expect(manifest).not.toBeNull();
    expect(manifest!.media).toHaveLength(11);
    for (const m of manifest!.media) {
      expect(m.lifecycle).toBe("published");
      expect(m.provenance.sourceUrl).toMatch(/^https:\/\//);
      expect(m.provenance.sourcePage).toMatch(/^https:\/\//);
      expect(m.provenance.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(m.digest).toMatch(HEX64);
      expect(isAcquirable(m.rightsSource)).toBe(true);
      expect(m.rightsBasis.trim().length).toBeGreaterThan(0);
      expect(m.variants.length).toBeGreaterThan(0);
    }
  });

  test("coppersmith: every derivative is FYD-local and its bytes digest-match", () => {
    const manifest = getPipelineManifest(COPPER.site);
    expect(manifest).not.toBeNull();
    let checked = 0;
    for (const m of manifest!.media) {
      for (const v of m.variants) {
        // Served URL is FYD-local: never a hotlink to the source site.
        expect(v.url.startsWith("/fyd-media/")).toBe(true);
        expect(v.url).not.toContain("coppersmithplumbing.com");
        const diskPath = join(process.cwd(), "public", v.url);
        expect(existsSync(diskPath)).toBe(true);
        expect(sha256File(diskPath)).toBe(v.digest);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("demo-authorized acquisition: happy-place (Nolan 2026-09-25)", () => {
  test("happy-place: every acquired asset is demo-authorized with full provenance", () => {
    const manifest = getPipelineManifest(HAPPY.site);
    expect(manifest).not.toBeNull();
    expect(manifest!.media.length).toBeGreaterThan(0);
    for (const m of manifest!.media) {
      // Only the explicit demo authorization may mint media for this site.
      expect(m.rightsSource).toBe("public-demo-source");
      expect(m.rightsBasis).toContain("Demo authorization (Nolan 2026-09-25)");
      expect(m.provenance.sourceUrl).toMatch(/^https:\/\//);
      expect(m.provenance.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(m.digest).toMatch(HEX64);
      expect(m.variants.length).toBeGreaterThan(0);
      for (const v of m.variants) {
        // FYD-served derivative, never a hotlink; lineage is data.
        expect(v.url.startsWith("/fyd-media/")).toBe(true);
        expect(v.derivedFrom).toBe(m.digest);
        // Proof: the bytes on disk sha256-match the manifest entry.
        const file = join(process.cwd(), "public", v.url);
        expect(existsSync(file)).toBe(true);
        expect(sha256File(file)).toBe(v.digest);
      }
    }
    // Observations record the full evidence trail: the gstatic reference
    // stays rejected; the authorized sources are ingested.
    const outcomes = manifest!.observations.map((o) => o.outcome);
    expect(outcomes).toContain("rejected");
    expect(outcomes).toContain("ingested");
    for (const o of manifest!.observations.filter((o) => o.outcome === "ingested")) {
      expect(o.digest).toMatch(HEX64);
    }
  });

  test("happy-place: only demo-authorized media surfaces through any selector", async () => {
    const graph = getVerifiedPublicProjectionSync(HAPPY.site, "anonymous").graph;
    const media = listObjectMedia(HAPPY.site, graph, HAPPY.business);
    expect(media.length).toBeGreaterThan(0);
    for (const d of media) {
      expect(d.src.startsWith("/fyd-media/")).toBe(true);
      expect(d.rightsSource).toBe("public-demo-source");
    }
    const hero = await heroMediaFor(HAPPY.site, graph, HAPPY.business);
    expect(hero).not.toBeNull();
    expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
    expect(hero!.role).not.toBe("logo");
    expect(getMediaManifest(HAPPY.site)?.items.length).toBeGreaterThan(0);
    const view = loadObjectViewById(projOrNull(HAPPY.site), HAPPY.site, HAPPY.business);
    expect(view).not.toBeNull();
    expect(view!.media.length).toBeGreaterThan(0);
    // The unacquired hero URL is ingest observation only: never a src.
    expect(JSON.stringify(view!.media)).not.toContain(HAPPY_UNACQUIRED_HERO);
  });

  test("happy-place: circle background is the acquired demo-authorized image", () => {
    const bg = resolveCircleBackground(HAPPY.site);
    expect(bg.kind).toBe("image");
    if (bg.kind === "image") {
      expect(bg.src.startsWith("/fyd-media/")).toBe(true);
      expect(bg.digest).toMatch(HEX64);
    }
  });
});

describe("coppersmith end to end: object view media + circle adapter", () => {
  test("loadObjectViewById lists all 11 assets with local srcs", () => {
    const view = loadObjectViewById(projOrNull(COPPER.site), COPPER.site, COPPER.business);
    expect(view).not.toBeNull();
    expect(view!.media).toHaveLength(11);
    // Logos lead, then heroes, then gallery: stable content-driven order.
    expect(view!.media[0].role).toBe("logo");
    for (const m of view!.media) {
      expect(m.src.startsWith("/fyd-media/")).toBe(true);
      expect(m.src).not.toContain("coppersmithplumbing.com");
      expect(m.digest).toMatch(HEX64);
      expect(isAcquirable(m.rightsSource)).toBe(true);
      expect(m.rightsBasis.trim().length).toBeGreaterThan(0);
      expect(m.sourceUrl).toMatch(/^https:\/\//);
      expect(m.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  test("heroMediaFor picks the hero-role derivative, never a logo", async () => {
    const graph = getVerifiedPublicProjectionSync(COPPER.site, "anonymous").graph;
    const hero = await heroMediaFor(COPPER.site, graph, COPPER.business);
    expect(hero).not.toBeNull();
    expect(hero!.role).toBe("hero");
    expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
  });

  test("circle adapter picks the logo derivative for the background", () => {
    const view = loadObjectViewById(projOrNull(COPPER.site), COPPER.site, COPPER.business);
    expect(view).not.toBeNull();
    const circle = objectViewToCircleProjection(view!);
    const bg = circle.background;
    expect(bg.kind).toBe("image");
    if (bg.kind === "image") {
      // First hero/logo entry in view.media order wins: the logo.
      expect(bg.src).toBe(view!.media[0].src);
      expect(bg.src.startsWith("/fyd-media/")).toBe(true);
      expect(bg.digest).toBe(view!.media[0].digest);
      expect(bg.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  test("resolveCircleBackground serves the acquired hero derivative", () => {
    const bg = resolveCircleBackground(COPPER.site);
    expect(bg.kind).toBe("image");
    if (bg.kind === "image") {
      expect(bg.src.startsWith("/fyd-media/")).toBe(true);
      expect(bg.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe("validator provenance hardening (Phase 4)", () => {
  const TS = "2026-09-21T00:00:00.000Z";
  const item = (overrides: Record<string, unknown> = {}): unknown => ({
    id: "fyd-media-test",
    schema: "ping.social.media@1",
    title: "Test",
    mediaType: "image",
    roles: ["gallery"],
    rightsSource: "public-demo-source",
    rightsBasis: "test basis",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://example.com/t.jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest: "a".repeat(64),
    originalFormat: "jpeg",
    width: 100,
    height: 100,
    variants: [
      {
        name: "thumbnail",
        width: 100,
        height: 100,
        format: "webp",
        url: "/fyd-media/test/thumbnail-100w.webp",
        bytes: 10,
        digest: "a".repeat(64),
        derivedFrom: "a".repeat(64),
      },
    ],
    depicts: [],
    altText: null,
    altTextSource: "none",
    visibility: "public",
    ...overrides,
  });
  const manifest = (media: unknown[]): unknown => ({
    siteId: "phase4-test",
    generatedAt: TS,
    generator: MEDIA_MODULE_VERSION,
    ingestRunId: "test-run-id",
    pipelineVersion: MEDIA_MODULE_VERSION,
    observations: [],
    media,
  });

  test("rejects an item missing provenance.sourceUrl", () => {
    const bad = item({
      provenance: { sourcePage: "https://example.com/", observedAt: TS },
    });
    expect(validatePipelineManifest(manifest([bad]), "phase4-test")).toBeNull();
  });

  test("rejects an item missing provenance.observedAt", () => {
    const bad = item({
      provenance: {
        sourceUrl: "https://example.com/t.jpg",
        sourcePage: "https://example.com/",
      },
    });
    expect(validatePipelineManifest(manifest([bad]), "phase4-test")).toBeNull();
  });

  test("accepts the committed coppersmith manifest", () => {
    const raw = JSON.parse(
      readFileSync(
        join(process.cwd(), "src", "fyd", "media", "manifests", COPPER.site + ".json"),
        "utf8",
      ),
    );
    expect(validatePipelineManifest(raw, COPPER.site)).not.toBeNull();
  });
});
