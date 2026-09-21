/**
 * Production-truth validation for pipeline manifests (media-hero-defects
 * lane, fyd-media@2).
 *
 * Contract: the read path serves ONLY manifests that are provably
 * production pipeline output. A stale, hand-written, or preview-origin
 * file is rejected exactly like a missing file: the caller renders
 * unknown, never the file's contents. Preview/experimental runs write
 * outside the production manifests dir (run-ingest.ts --preview ->
 * manifests/preview/), so the production read path cannot reach them
 * even structurally.
 *
 * The file-based tests write a temporary manifest into the production
 * manifests dir and remove it in a finally block, exercising the REAL
 * read path end to end.
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getPipelineManifest, validatePipelineManifest } from "../bundle-media";
import { MEDIA_MODULE_VERSION } from "../types";

const TS = "2026-09-21T00:00:00.000Z";
const SITE = "__test-manifest-guard";

function item(overrides: Record<string, unknown> = {}): any {
  return {
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
  };
}

function manifest(overrides: Record<string, unknown> = {}): any {
  return {
    siteId: SITE,
    generatedAt: TS,
    generator: MEDIA_MODULE_VERSION,
    ingestRunId: "test-run-id",
    pipelineVersion: MEDIA_MODULE_VERSION,
    observations: [],
    media: [item()],
    ...overrides,
  };
}

describe("validatePipelineManifest", () => {
  test("accepts a manifest stamped by the production pipeline", () => {
    expect(validatePipelineManifest(manifest(), SITE)).not.toBeNull();
  });

  test("rejects a preview-marked manifest, even with full provenance", () => {
    expect(
      validatePipelineManifest(manifest({ preview: true }), SITE),
    ).toBeNull();
  });

  test("rejects a manifest missing the generator stamp", () => {
    const m = manifest();
    delete m.generator;
    expect(validatePipelineManifest(m, SITE)).toBeNull();
  });

  test("rejects a manifest with a non-production generator", () => {
    expect(
      validatePipelineManifest(manifest({ generator: "preview-runner@1" }), SITE),
    ).toBeNull();
  });

  test("rejects a manifest missing the ingest run id", () => {
    const m = manifest();
    delete m.ingestRunId;
    expect(validatePipelineManifest(m, SITE)).toBeNull();
  });

  test("rejects a stale pipeline version", () => {
    expect(
      validatePipelineManifest(manifest({ pipelineVersion: "fyd-media@1" }), SITE),
    ).toBeNull();
  });

  test("rejects a siteId mismatch", () => {
    expect(validatePipelineManifest(manifest(), "other-site")).toBeNull();
  });

  test("rejects a manifest carrying a non-acquirable media item", () => {
    const m = manifest();
    m.media = [item({ rightsSource: "unclear-reference-only" })];
    expect(validatePipelineManifest(m, SITE)).toBeNull();
  });

  test("rejects a media item with no variants (no bytes behind it)", () => {
    const m = manifest();
    m.media = [item({ variants: [] })];
    expect(validatePipelineManifest(m, SITE)).toBeNull();
  });

  test("rejects a media item with no digest", () => {
    const m = manifest();
    m.media = [item({ digest: "" })];
    expect(validatePipelineManifest(m, SITE)).toBeNull();
  });

  test("rejects non-object input", () => {
    expect(validatePipelineManifest(null, SITE)).toBeNull();
    expect(validatePipelineManifest("nope", SITE)).toBeNull();
  });
});

describe("getPipelineManifest read path", () => {
  const path = join(
    process.cwd(),
    "src",
    "fyd",
    "media",
    "manifests",
    SITE + ".json",
  );

  function withFile(contents: unknown, fn: () => void): void {
    writeFileSync(path, JSON.stringify(contents));
    try {
      fn();
    } finally {
      unlinkSync(path);
    }
  }

  test("a preview-marked file is ignored by the read path, never served", () => {
    withFile(manifest({ preview: true }), () => {
      expect(getPipelineManifest(SITE)).toBeNull();
    });
  });

  test("a file missing pipeline provenance is ignored by the read path", () => {
    const m = manifest();
    delete m.generator;
    delete m.ingestRunId;
    delete m.pipelineVersion;
    withFile(m, () => {
      expect(getPipelineManifest(SITE)).toBeNull();
    });
  });

  test("a fully stamped file is served by the read path", () => {
    withFile(manifest(), () => {
      const m = getPipelineManifest(SITE);
      expect(m).not.toBeNull();
      expect(m!.siteId).toBe(SITE);
      expect(m!.media).toHaveLength(1);
    });
  });
});
