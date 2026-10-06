/**
 * Tests for the media binding stage (authority-binding.ts).
 *
 * The binding is the factory's thin-consumer seam into the PING media
 * authorities: bytes go to the blob authority, records go to the KV
 * authority. All authority access is injected, so these tests never
 * touch KV, Blob, or the network.
 *
 * Pins:
 * - happy path: validated asset -> uploads + PublishedMediaAsset save,
 *   with every served URL exactly what the (fake) authority returned
 *   (no hardcoded URLs);
 * - idempotency: re-binding a digest never re-uploads or re-saves;
 * - fail-closed rejections BEFORE any byte moves: unclear rights,
 *   hotlink variant URLs, synthetic content identity, bytes/digest
 *   mismatch, missing variants.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Media } from "../../types/media";
import {
  MediaBindingError,
  bindMediaToAuthority,
  type AuthorityBindingDeps,
  type BindableAsset,
} from "../authority-binding";
import { type FydMediaObject } from "../types";

const TS = "2026-09-23T00:00:00.000Z";

const sha = (b: Buffer): string =>
  createHash("sha256").update(b).digest("hex");

async function png(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 180, g: 100, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

async function webp(buf: Buffer, w: number): Promise<Buffer> {
  return sharp(buf).resize(w).webp({ quality: 80 }).toBuffer();
}

interface FakeAuthority {
  deps: AuthorityBindingDeps;
  uploads: Array<{ buffer: Buffer; filename: string; contentType: string }>;
  saved: Media[];
  existing: Map<string, Media>;
}

function fakeAuthority(): FakeAuthority {
  const f: FakeAuthority = {
    deps: null as unknown as AuthorityBindingDeps,
    uploads: [],
    saved: [],
    existing: new Map(),
  };
  f.deps = {
    uploadToBlob: async (buffer, filename, contentType) => {
      f.uploads.push({ buffer, filename, contentType });
      return {
        url: "https://blob.test/" + filename,
        uploadedAt: TS,
        alreadyExisted: false,
        contentHash: sha(buffer),
      };
    },
    findMediaByContentHash: async (contentHash) =>
      f.existing.get(contentHash) ?? null,
    saveMedia: async (media) => {
      f.saved.push(media);
    },
  };
  return f;
}

async function bindableAsset(
  rightsSource: FydMediaObject["rightsSource"] = "business-provided",
): Promise<BindableAsset> {
  const original = await png(64, 48);
  const digest = sha(original);
  const thumbBytes = await webp(original, 32);
  const heroBytes = await webp(original, 48);
  const blurBytes = await webp(original, 10);
  const id = "fyd-media-" + digest.slice(0, 16);
  const local = (name: string, w: number) =>
    "/fyd-media/" + digest + "/" + name + "-" + w + "w.webp";
  const media: FydMediaObject = {
    id,
    schema: "ping.social.media@1",
    title: "Fixture photo",
    mediaType: "image",
    roles: ["hero", "gallery"],
    rightsSource,
    rightsBasis: "Business-provided fixture for the binding test.",
    lifecycle: "derivatives_ready",
    provenance: {
      sourceUrl: "https://example.com/photo.jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest,
    originalFormat: "png",
    width: 64,
    height: 48,
    variants: [
      {
        name: "thumbnail",
        width: 32,
        height: 24,
        format: "webp",
        url: local("thumbnail", 32),
        bytes: thumbBytes.length,
        digest: sha(thumbBytes),
        derivedFrom: digest,
      },
      {
        name: "hero",
        width: 48,
        height: 36,
        format: "webp",
        url: local("hero", 48),
        bytes: heroBytes.length,
        digest: sha(heroBytes),
        derivedFrom: digest,
      },
      {
        name: "blur",
        width: 10,
        height: 8,
        format: "webp",
        url: local("blur", 10),
        bytes: blurBytes.length,
        digest: sha(blurBytes),
        derivedFrom: digest,
      },
    ],
    depicts: ["biz-1"],
    altText: "Fixture alt",
    altTextSource: "source",
    visibility: "public",
  };
  return {
    media,
    originalBytes: original,
    variants: [
      {
        name: "thumbnail",
        bytes: thumbBytes,
        width: 32,
        height: 24,
        digest: sha(thumbBytes),
      },
      {
        name: "hero",
        bytes: heroBytes,
        width: 48,
        height: 36,
        digest: sha(heroBytes),
      },
      {
        name: "blur",
        bytes: blurBytes,
        width: 10,
        height: 8,
        digest: sha(blurBytes),
      },
    ],
  };
}

describe("bindMediaToAuthority", () => {
  test("happy path: uploads bytes and saves a PublishedMediaAsset", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    const receipt = await bindMediaToAuthority(asset, fake.deps);

    // Original + thumbnail + hero uploaded; blur travels as a data URL, never uploaded.
    expect(fake.uploads.map((u) => u.filename).sort()).toEqual(
      [
        asset.media.id + "-hero-48w.webp",
        asset.media.id + "-original.png",
        asset.media.id + "-thumbnail-32w.webp",
      ].sort(),
    );

    expect(fake.saved).toHaveLength(1);
    const record = fake.saved[0];
    expect(record.lifecycleState).toBe("published");
    expect(record.source).toBe("local");
    expect(record.storage).toBe("blob");
    expect(record.contentHash).toBe(asset.media.digest);
    expect(record.id).toBe(asset.media.id);

    // No hardcoded URLs: every served URL is exactly what the authority returned.
    const returned = fake.uploads.map((u) => "https://blob.test/" + u.filename);
    for (const u of returned) {
      expect(Object.values(receipt.urls)).toContain(u);
    }
    const variants = (record as { variants: Record<string, unknown> }).variants;
    expect(variants["original"]).toBe(
      "https://blob.test/" + asset.media.id + "-original.png",
    );

    // Never a drive reference, never a drive URL.
    expect("drive" in record).toBe(false);
    expect(JSON.stringify(record)).not.toMatch(/\/api\/drive\//);

    expect(receipt.mediaId).toBe(asset.media.id);
    expect(receipt.contentHash).toBe(asset.media.digest);
    expect(receipt.alreadyExisted).toBe(false);
  });

  test("idempotent: an already-bound digest is never re-uploaded or re-saved", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    fake.existing.set(asset.media.digest, {
      id: asset.media.id,
      contentHash: asset.media.digest,
      variants: { original: "https://blob.test/old.webp" },
    } as Media);
    const receipt = await bindMediaToAuthority(asset, fake.deps);
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
    expect(receipt.alreadyExisted).toBe(true);
    expect(receipt.mediaId).toBe(asset.media.id);
    expect(receipt.urls["original"]).toBe("https://blob.test/old.webp");
  });

  test("rejects unclear-reference-only rights before any byte moves", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset("unclear-reference-only");
    await expect(bindMediaToAuthority(asset, fake.deps)).rejects.toThrow(
      MediaBindingError,
    );
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
  });

  test("rejects hotlink inputs: remote variant URLs are never bound as owned bytes", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    asset.media.variants[0].url = "https://cdn.example.com/stolen.jpg";
    await expect(bindMediaToAuthority(asset, fake.deps)).rejects.toThrow(
      /hotlink/i,
    );
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
  });

  test("rejects synthetic content identity (digest === sha256(id))", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    asset.media.digest = createHash("sha256")
      .update(asset.media.id, "utf8")
      .digest("hex");
    await expect(bindMediaToAuthority(asset, fake.deps)).rejects.toThrow(
      /synthetic/i,
    );
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
  });

  test("rejects bytes that do not sha256-match the digest", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    asset.originalBytes = await png(16, 16);
    await expect(bindMediaToAuthority(asset, fake.deps)).rejects.toThrow(
      /digest|mismatch/i,
    );
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
  });

  test("rejects assets with no variants", async () => {
    const fake = fakeAuthority();
    const asset = await bindableAsset();
    asset.variants = [];
    asset.media.variants = [];
    await expect(bindMediaToAuthority(asset, fake.deps)).rejects.toThrow(
      /variant/i,
    );
    expect(fake.uploads).toHaveLength(0);
    expect(fake.saved).toHaveLength(0);
  });
});
