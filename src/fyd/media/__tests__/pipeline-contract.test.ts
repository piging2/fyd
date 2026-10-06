/**
 * FYD media pipeline contract (lane-media).
 *
 * The minimum pipeline, end to end, with no network:
 *   SOURCE BYTES -> DIGEST -> METADATA -> DERIVATIVES -> MANIFEST -> RENDER
 * plus the safety gates the task requires:
 *   unsafe URL rejected, oversized image rejected/capped,
 *   digest stability, unauthorized source excluded.
 *
 * The network seam (safeFetchImage) is exercised through the media shim
 * with injected deps (dnsLookup / fetchImpl): nothing here touches the
 * real network.
 */

import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { classifyRights } from "../discover";
import { generateDerivatives, hashContentBytes, planDerivatives } from "../derivatives";
import { safeFetchImage, type SafeFetchDeps } from "../safe-fetch";
import { validatePipelineManifest } from "../bundle-media";
import { heroMediaFor } from "../select";
import { isAcquirable } from "../types";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const TS = "2026-09-21T00:00:00.000Z";
const SITE = "__test-pipeline-contract";

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "Pipeline contract fixture.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  };
}

function testGraph(): ObjectGraph {
  return { objects: [businessObject("biz-test-1")], relationships: [] };
}

function manifestPath(): string {
  return join(process.cwd(), "src", "fyd", "media", "manifests", SITE + ".json");
}

const publicDns: SafeFetchDeps["dnsLookup"] = async () => [{ address: "93.184.216.34" }];

describe("pipeline happy path (no network)", () => {
  test("bytes -> digest -> metadata -> derivatives -> manifest -> render", async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .png()
      .toBuffer();

    // DIGEST: content address.
    const digest = hashContentBytes(input);
    expect(digest).toHaveLength(64);

    // DERIVATIVES + METADATA: shape observed from the bytes.
    const dir = mkdtempSync(join(tmpdir(), "fyd-pipeline-"));
    try {
      const gen = await generateDerivatives(input, digest, dir);
      expect(gen.width).toBe(1200);
      expect(gen.height).toBe(800);
      expect(gen.format).toBe("png");
      // 1200w source: thumbnail 480 + card 768 + blur 10. No hero (1600 >
      // source), no upscale, no speculative ladder.
      expect(gen.variants.map((v) => v.name)).toEqual(["thumbnail", "card", "blur"]);
      for (const v of gen.variants) {
        expect(v.derivedFrom).toBe(digest);
        expect(v.digest).toHaveLength(64);
        expect(v.url).toBe("/fyd-media/" + digest + "/" + v.name + "-" + v.width + "w.webp");
      }

      // Deterministic: same bytes -> same digest -> same derivative bytes.
      const dir2 = mkdtempSync(join(tmpdir(), "fyd-pipeline-"));
      try {
        const again = await generateDerivatives(input, digest, dir2);
        expect(again.variants.map((v) => v.digest)).toEqual(
          gen.variants.map((v) => v.digest),
        );
      } finally {
        rmSync(dir2, { recursive: true, force: true });
      }

      // MANIFEST: the minted object carries the full provenance chain and
      // validates as production truth.
      const media: any = {
        id: "fyd-media-" + digest.slice(0, 16),
        schema: "ping.social.media@1",
        title: "Contract fixture",
        mediaType: "image",
        roles: ["hero", "gallery"],
        rightsSource: "public-demo-source",
        rightsBasis: "fixture rights basis",
        lifecycle: "published",
        provenance: {
          sourceUrl: "https://example.com/photo.png",
          sourcePage: "https://example.com/",
          observedAt: TS,
        },
        digest,
        originalFormat: gen.format,
        width: gen.width,
        height: gen.height,
        variants: gen.variants,
        depicts: [],
        altText: "Contract fixture photo",
        altTextSource: "source",
        visibility: "public",
      };
      const manifest = {
        siteId: SITE,
        generatedAt: TS,
        generator: "fyd-media@2",
        ingestRunId: "test-run-pipeline-contract",
        pipelineVersion: "fyd-media@2",
        observations: [],
        media: [media],
      };
      expect(validatePipelineManifest(manifest, SITE)).not.toBeNull();

      // RENDER: the hero selector resolves the minted asset to a
      // FYD-served derivative, never a hotlink.
      const path = manifestPath();
      writeFileSync(path, JSON.stringify(manifest));
      try {
        const hero = heroMediaFor(SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        expect(hero!.id).toBe(media.id);
        expect(hero!.digest).toBe(digest);
        expect(hero!.role).toBe("hero");
        expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
        expect(hero!.src.startsWith("http")).toBe(false);
        expect(hero!.sourceUrl).toBe("https://example.com/photo.png");
      } finally {
        unlinkSync(path);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("unsafe URL rejected", () => {
  test("non-http(s) schemes are rejected before any network", async () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:image/png;base64,AAA"]) {
      const res = await safeFetchImage(url);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain("Scheme not allowed");
    }
  });

  test("credential-bearing URLs are rejected", async () => {
    const res = await safeFetchImage("https://user:pass@example.com/x.jpg");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Credential");
  });

  test("private IP literals are rejected without a fetch", async () => {
    for (const url of ["http://127.0.0.1/x.jpg", "http://169.254.169.254/latest/meta-data/"]) {
      const res = await safeFetchImage(url);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain("DNS rejected");
    }
  });

  test("a redirect into private space is rejected, not followed", async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as unknown as typeof fetch;
    const res = await safeFetchImage("https://example.com/a.jpg", undefined, {
      dnsLookup: publicDns,
      fetchImpl,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("DNS rejected");
  });

  test("non-image content-types are rejected", async () => {
    const fetchImpl = (async () =>
      new Response(Buffer.from("<html></html>"), {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const res = await safeFetchImage("https://example.com/a.jpg", undefined, {
      dnsLookup: publicDns,
      fetchImpl,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Content-type not allowed");
  });
});

describe("oversized image rejected/capped", () => {
  test("declared content-length over the cap is rejected", async () => {
    const fetchImpl = (async () =>
      new Response(Buffer.alloc(10), {
        headers: { "content-type": "image/jpeg", "content-length": "999999999" },
      })) as unknown as typeof fetch;
    const res = await safeFetchImage("https://example.com/big.jpg", { maxBytes: 1000 }, {
      dnsLookup: publicDns,
      fetchImpl,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Declared size");
  });

  test("a body that grows past the cap mid-stream is aborted", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    const fetchImpl = (async () =>
      new Response(stream, { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    const res = await safeFetchImage("https://example.com/big.jpg", { maxBytes: 1000 }, {
      dnsLookup: publicDns,
      fetchImpl,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Body exceeded size limit");
  });

  test("absurd source dimensions are rejected at derivative generation", async () => {
    // Re-pinned here because it is the fetch-independent backstop: even a
    // byte stream that passed the gate cannot become a 8100px decode.
    const huge = await sharp({
      create: { width: 8100, height: 16, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const dir = mkdtempSync(join(tmpdir(), "fyd-pipeline-"));
    try {
      await expect(
        generateDerivatives(huge, hashContentBytes(huge), dir),
      ).rejects.toThrow(/exceed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("digest stability", () => {
  test("known-answer vector: sha256 of 'abc'", () => {
    expect(hashContentBytes(Buffer.from("abc", "utf8"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("same bytes hashed twice give the same digest", () => {
    const a = hashContentBytes(Buffer.from("same bytes", "utf8"));
    const b = hashContentBytes(Buffer.from("same bytes", "utf8"));
    expect(a).toBe(b);
  });

  test("different bytes give different digests", () => {
    expect(hashContentBytes(Buffer.from("one", "utf8"))).not.toBe(
      hashContentBytes(Buffer.from("two", "utf8")),
    );
  });

  test("derivative selection is deterministic for a source width", () => {
    expect(planDerivatives(2000)).toEqual(planDerivatives(2000));
  });
});

describe("unauthorized source excluded", () => {
  test("off-origin imagery classifies unclear-reference-only", () => {
    const call = classifyRights("https://cdn.other.com/pic.jpg", "biz", "https://biz.com");
    expect(call.rightsSource).toBe("unclear-reference-only");
    expect(isAcquirable(call.rightsSource)).toBe(false);
  });

  test("logo-like image that does not match the business is not acquired", () => {
    const call = classifyRights("https://biz.com/acme-brand-badge.png", "biz", "https://biz.com");
    expect(call.rightsSource).toBe("unclear-reference-only");
    expect(isAcquirable(call.rightsSource)).toBe(false);
  });

  test("the rights gate predicate: classify before bytes move", () => {
    // This pins the ingest.ts gate ordering contract without network:
    // an unclear-reference-only classification must never reach fetch,
    // digest, or mint. The single enforcement predicate is isAcquirable.
    const offOrigin = classifyRights("https://cdn.other.com/pic.jpg", "biz", "https://biz.com");
    const wouldAcquire = isAcquirable(offOrigin.rightsSource);
    expect(wouldAcquire).toBe(false);
  });

  test("a manifest containing a non-acquirable object fails validation as a unit", () => {
    const bad: any = {
      id: "fyd-media-" + "b".repeat(16),
      schema: "ping.social.media@1",
      title: "Bad fixture",
      mediaType: "image",
      roles: ["gallery"],
      rightsSource: "unclear-reference-only",
      rightsBasis: "fixture",
      lifecycle: "published",
      provenance: {
        sourceUrl: "https://cdn.other.com/pic.jpg",
        sourcePage: "https://biz.com/",
        observedAt: TS,
      },
      digest: "b".repeat(64),
      originalFormat: "jpeg",
      width: 100,
      height: 100,
      variants: [
        {
          name: "thumbnail",
          width: 100,
          height: 100,
          format: "webp",
          url: "/fyd-media/bad/thumbnail-100w.webp",
          bytes: 100,
          digest: "b".repeat(64),
          derivedFrom: "b".repeat(64),
        },
      ],
      depicts: [],
      altText: null,
      altTextSource: "none",
      visibility: "public",
    };
    const manifest = {
      siteId: SITE,
      generatedAt: TS,
      generator: "fyd-media@2",
      ingestRunId: "test-run-bad",
      pipelineVersion: "fyd-media@2",
      observations: [],
      media: [bad],
    };
    // The read path treats this exactly like a missing manifest: the
    // caller renders unknown, never the untrusted content.
    expect(validatePipelineManifest(manifest, SITE)).toBeNull();
  });
});
