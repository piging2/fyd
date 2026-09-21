/**
 * Tests for the fyd-media@2 provenance query surface.
 *
 * Contract: the query layer exposes the full provenance chain for every
 * pipeline-acquired asset (source URL, observed_at, digest, dimensions,
 * rights/source classification, derived-asset links), and reference-only
 * assets never appear (they are never minted as media objects).
 */

import { isAcquirable } from "../types";
import { getMediaProvenance, listMediaProvenance } from "../provenance";
import type { MediaManifest } from "../types";

jest.mock("../bundle-media", () => {
  const acquired: MediaManifest["media"][number] = {
    id: "fyd-media-aaaabbbbccccdddd",
    schema: "ping.social.media@1",
    title: "Shop front",
    mediaType: "image",
    roles: ["hero", "gallery"],
    rightsSource: "public-demo-source",
    rightsBasis: "Public marketing imagery on the business site; FYD claims no copyright.",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://www.example.com/images/shop.jpg",
      sourcePage: "https://www.example.com/",
      observedAt: "2026-09-21T14:00:00.000Z",
      redirectChain: ["https://example.com/images/shop.jpg"],
    },
    digest: "aaaabbbbccccdddd" + "0".repeat(48),
    originalFormat: "jpeg",
    width: 1600,
    height: 900,
    variants: [
      {
        name: "w768",
        width: 768,
        height: 432,
        format: "webp",
        url: "/fyd-media/aaaabbbbccccdddd000000000000000000000000000000000000000000000000/w768-768w.webp",
        bytes: 12345,
        digest: "v".repeat(64),
        derivedFrom: "aaaabbbbccccdddd" + "0".repeat(48),
      },
    ],
    depicts: [],
    altText: "Shop front",
    altTextSource: "source",
    visibility: "public",
  };
  // A reference-only entry must never be minted by the pipeline; the mock
  // keeps one here anyway to prove the query layer excludes it even if a
  // stale manifest carried one.
  const referenceOnly = {
    ...acquired,
    id: "fyd-media-refonly",
    digest: "r".repeat(64),
    rightsSource: "unclear-reference-only",
    rightsBasis: "Hosted off-site; retained as a reference only.",
  };
  const manifest: MediaManifest = {
    siteId: "demo-site",
    generatedAt: "2026-09-21T14:00:00.000Z",
    generator: "fyd-media@2",
    observations: [],
    media: [acquired, referenceOnly],
  };
  return {
    getPipelineManifest: (siteId: string) => (siteId === "demo-site" ? manifest : null),
  };
});

const DIGEST = "aaaabbbbccccdddd" + "0".repeat(48);

describe("isAcquirable", () => {
  test("business-provided and public-demo-source are acquirable", () => {
    expect(isAcquirable("business-provided")).toBe(true);
    expect(isAcquirable("public-demo-source")).toBe(true);
  });
  test("unclear-reference-only is never acquirable", () => {
    expect(isAcquirable("unclear-reference-only")).toBe(false);
  });
});

describe("getMediaProvenance", () => {
  test("returns the full citable record for an acquired asset", () => {
    const rec = getMediaProvenance("demo-site", DIGEST);
    expect(rec).not.toBeNull();
    expect(rec!.assetId).toBe("fyd-media-aaaabbbbccccdddd");
    expect(rec!.digest).toBe(DIGEST);
    expect(rec!.provenance.sourceUrl).toBe("https://www.example.com/images/shop.jpg");
    expect(rec!.provenance.observedAt).toBe("2026-09-21T14:00:00.000Z");
    expect(rec!.provenance.redirectChain).toEqual(["https://example.com/images/shop.jpg"]);
    expect(rec!.width).toBe(1600);
    expect(rec!.height).toBe(900);
    expect(rec!.mediaType).toBe("image");
    expect(rec!.rightsSource).toBe("public-demo-source");
    expect(rec!.rightsBasis).toContain("FYD claims no copyright");
  });

  test("every derivative names the original digest it was produced from", () => {
    const rec = getMediaProvenance("demo-site", DIGEST);
    expect(rec!.derivedAssets.length).toBeGreaterThan(0);
    for (const v of rec!.derivedAssets) {
      expect(v.derivedFrom).toBe(DIGEST);
      expect(v.servedFrom).toBe("/fyd-media/" + DIGEST + "/");
      expect(v.url.startsWith("/fyd-media/")).toBe(true);
    }
  });

  test("reference-only assets are not retrievable, even by digest", () => {
    expect(getMediaProvenance("demo-site", "r".repeat(64))).toBeNull();
  });

  test("unknown site or digest is null, never a stand-in", () => {
    expect(getMediaProvenance("nope", DIGEST)).toBeNull();
    expect(getMediaProvenance("demo-site", "0".repeat(64))).toBeNull();
  });
});

describe("listMediaProvenance", () => {
  test("lists acquired assets only, sorted by asset id", () => {
    const list = listMediaProvenance("demo-site");
    expect(list).not.toBeNull();
    expect(list!.map((r) => r.assetId)).toEqual(["fyd-media-aaaabbbbccccdddd"]);
  });
  test("unknown site is null", () => {
    expect(listMediaProvenance("nope")).toBeNull();
  });
});
