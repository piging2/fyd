/**
 * MEDIA-INTELLIGENCE lane 5 (design sprint 2026-09-26): media richness
 * scoring + gallery dimension gate, asserted against BOTH sites' real
 * committed manifests (the same store the pages read).
 *
 * Determinism contract: same manifest -> same scores -> same selection.
 * Every assertion below is reproducible from a clean checkout.
 */

import {
  scoreMedia,
  rankByRichness,
  isGalleryEligible,
  GALLERY_MIN_WIDTH,
  GALLERY_MIN_HEIGHT,
  RICHNESS_REF_AREA,
  type MediaRichness,
} from "../richness";
import { getPipelineManifest } from "../bundle-media";
import { galleryMediaFor, heroMediaFor } from "../select";
import type { FydMediaObject } from "../types";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const TS = "2026-09-21T00:00:00.000Z";

function media(over: Partial<FydMediaObject>): FydMediaObject {
  return {
    id: "fyd-media-test",
    schema: "ping.social.media@1",
    title: "Test photo",
    mediaType: "image",
    roles: ["gallery"],
    rightsSource: "public-demo-source",
    rightsBasis: "test",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://example.com/a.jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest: "0".repeat(64),
    originalFormat: "jpeg",
    width: 1080,
    height: 1440,
    variants: [],
    depicts: [],
    altText: null,
    altTextSource: "none",
    visibility: "public",
    ...over,
  };
}

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "A test business for media intelligence.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  };
}

function testGraph(): ObjectGraph {
  return { objects: [businessObject("biz-test-1")], relationships: [] };
}

function expectComponentsInRange(r: MediaRichness): void {
  for (const k of ["score", "resolution", "role", "provenance", "alt", "focal"] as const) {
    expect(r[k]).toBeGreaterThanOrEqual(0);
    expect(r[k]).toBeLessThanOrEqual(1);
  }
}

describe("scoreMedia: pure and deterministic", () => {
  test("same object -> identical score object on repeat calls", () => {
    const m = media({});
    expect(scoreMedia(m)).toEqual(scoreMedia(m));
  });

  test("all components stay in 0..1, including degenerate inputs", () => {
    expectComponentsInRange(scoreMedia(media({})));
    expectComponentsInRange(scoreMedia(media({ width: 0, height: 0 })));
    expectComponentsInRange(
      scoreMedia(media({ roles: [], rightsSource: "unclear-reference-only" })),
    );
  });

  test("formula spot-check: 118x20 badge vs 1080x1440 photo", () => {
    const badge = scoreMedia(media({ width: 118, height: 20 }));
    const photo = scoreMedia(
      media({
        width: 1080,
        height: 1440,
        altText: "x",
        altTextSource: "generated",
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    );
    // resolution = sqrt(area / 1920*1080)
    expect(badge.resolution).toBeCloseTo(
      Math.sqrt((118 * 20) / RICHNESS_REF_AREA),
      4,
    );
    expect(photo.resolution).toBeCloseTo(
      Math.sqrt((1080 * 1440) / RICHNESS_REF_AREA),
      4,
    );
    expect(photo.score).toBeGreaterThan(badge.score);
    expect(badge.score).toBeLessThan(0.5);
    expect(photo.score).toBeGreaterThan(0.75);
  });

  test("provenance ordering: business-provided > public-demo-source > unclear", () => {
    const a = scoreMedia(media({ rightsSource: "business-provided" }));
    const b = scoreMedia(media({ rightsSource: "public-demo-source" }));
    const c = scoreMedia(media({ rightsSource: "unclear-reference-only" }));
    expect(a.provenance).toBe(1.0);
    expect(b.provenance).toBe(0.7);
    expect(c.provenance).toBe(0.0);
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeGreaterThan(c.score);
  });

  test("logo role scores low: brand identity is not photography", () => {
    const logo = scoreMedia(media({ roles: ["logo"] }));
    const hero = scoreMedia(media({ roles: ["hero"] }));
    expect(logo.role).toBeLessThan(hero.role);
    expect(logo.score).toBeLessThan(hero.score);
  });

  test("alt and focal components reward backfilled metadata", () => {
    const bare = scoreMedia(media({}));
    const filled = scoreMedia(
      media({
        altText: "Test photo, Test Business",
        altTextSource: "generated",
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    );
    expect(filled.alt).toBe(0.6);
    expect(filled.focal).toBe(1.0);
    expect(filled.score).toBeGreaterThan(bare.score);
  });
});

describe("rankByRichness: stable order", () => {
  test("highest score first, id ascending on ties, deterministic", () => {
    const items = [
      media({ id: "m-b", width: 118, height: 20 }),
      media({ id: "m-a", width: 1080, height: 1440 }),
      media({ id: "m-c", width: 1080, height: 1440 }),
    ];
    const once = rankByRichness(items).map((m) => m.id);
    const twice = rankByRichness(items).map((m) => m.id);
    expect(once).toEqual(twice);
    expect(once[0]).toBe("m-a");
    // m-a and m-c tie: id order wins.
    expect(once[1]).toBe("m-c");
    expect(once[2]).toBe("m-b");
  });
});

describe("isGalleryEligible: the dimension gate", () => {
  test("gate constants", () => {
    expect(GALLERY_MIN_WIDTH).toBe(300);
    expect(GALLERY_MIN_HEIGHT).toBe(200);
  });

  test("the five Coppersmith brand badges fail the gate", () => {
    for (const [w, h] of [
      [118, 20],
      [124, 123],
      [183, 45],
      [200, 40],
      [187, 58],
    ]) {
      expect(isGalleryEligible(media({ width: w, height: h }))).toBe(false);
    }
  });

  test("real photographs pass the gate", () => {
    expect(isGalleryEligible(media({ width: 1080, height: 1440 }))).toBe(true);
    expect(isGalleryEligible(media({ width: 1000, height: 563 }))).toBe(true);
    expect(isGalleryEligible(media({ width: 600, height: 600 }))).toBe(true);
    expect(isGalleryEligible(media({ width: 999, height: 999 }))).toBe(true);
  });

  test("missing data is eligible: absence of evidence is not a bad photo", () => {
    expect(isGalleryEligible(undefined)).toBe(true);
    expect(isGalleryEligible(null)).toBe(true);
  });
});

describe("manifest backfill: focal points and alt text (real manifests)", () => {
  test("every gallery/hero-role asset on both sites has a focal point and a real alt", () => {
    for (const site of ["happy-place", "coppersmith-plumbing"]) {
      const manifest = getPipelineManifest(site);
      expect(manifest).not.toBeNull();
      const visual = manifest!.media.filter((m) =>
        m.roles.some((r) => r === "gallery" || r === "hero"),
      );
      expect(visual.length).toBeGreaterThan(0);
      for (const m of visual) {
        const isPhoto =
          (m.width >= GALLERY_MIN_WIDTH && m.height >= GALLERY_MIN_HEIGHT) ||
          m.roles.includes("hero");
        if (isPhoto) {
          expect(m.focalPoint).toBeDefined();
          expect(m.focalPoint!.x).toBeGreaterThanOrEqual(0);
          expect(m.focalPoint!.x).toBeLessThanOrEqual(1);
          expect(m.focalPoint!.y).toBeGreaterThanOrEqual(0);
          expect(m.focalPoint!.y).toBeLessThanOrEqual(1);
        }
        expect((m.altText ?? "").trim().length).toBeGreaterThan(0);
        expect(m.altTextSource).not.toBe("none");
      }
    }
  });

  test("brand badges and logos carry no focal point (not photographic subjects)", () => {
    const manifest = getPipelineManifest("coppersmith-plumbing");
    expect(manifest).not.toBeNull();
    const nonPhoto = manifest!.media.filter(
      (m) => !(m.width >= GALLERY_MIN_WIDTH && m.height >= GALLERY_MIN_HEIGHT),
    );
    expect(nonPhoto.length).toBe(5);
    for (const m of nonPhoto) {
      expect(m.focalPoint).toBeUndefined();
    }
  });
});

describe("selection outcomes on both sites' real manifests", () => {
  test("happy-place gallery: all 5 project photos, non-empty alt everywhere", () => {
    const g = galleryMediaFor("happy-place", testGraph(), "biz-test-1");
    expect(g).toHaveLength(5);
    for (const d of g) {
      expect(d.role).toBe("gallery");
      expect(d.alt.trim().length).toBeGreaterThan(0);
    }
  });

  test("coppersmith gallery: badges gated out, 3 real photos remain", () => {
    const g = galleryMediaFor("coppersmith-plumbing", testGraph(), "biz-test-1");
    expect(g).toHaveLength(3);
    const ids = g.map((d) => d.id);
    expect(ids).toContain("fyd-media-6d27edae022c3868");
    expect(ids).toContain("fyd-media-3bf9466d3e1be98c");
    expect(ids).toContain("fyd-media-992d1fa19a675f01");
    for (const d of g) {
      expect(d.role).toBe("gallery");
      expect(d.alt.trim().length).toBeGreaterThan(0);
      expect(d.src.startsWith("/fyd-media/")).toBe(true);
    }
  });

  test("hero selection: coppersmith hero-role asset wins; happy-place falls back to photography", () => {
    const ch = heroMediaFor("coppersmith-plumbing", testGraph(), "biz-test-1");
    expect(ch).not.toBeNull();
    expect(ch!.id).toBe("fyd-media-db347abf5ab76b99");
    expect(ch!.role).toBe("hero");
    expect(ch!.alt.trim().length).toBeGreaterThan(0);

    const hh = heroMediaFor("happy-place", testGraph(), "biz-test-1");
    expect(hh).not.toBeNull();
    expect(hh!.role).not.toBe("logo");
    expect(hh!.alt.trim().length).toBeGreaterThan(0);
  });

  test("heroMediaFor never returns a logo on either site", () => {
    for (const site of ["happy-place", "coppersmith-plumbing"]) {
      const h = heroMediaFor(site, testGraph(), "biz-test-1");
      if (h) expect(h.role).not.toBe("logo");
    }
  });
});
