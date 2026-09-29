/**
 * Media binding stage (fyd-media@2 lane-media): pipeline -> PING media authority.
 *
 * The factory media stage is a THIN CONSUMER of the PING media
 * authorities; it is not a parallel media system. This module is the
 * binding seam: a validated pipeline asset (discover -> observe ->
 * evidence -> digest -> derivative) is published into the authorities
 * owned by src/lib/blob-storage.ts (bytes, content-addressed) and
 * src/lib/media-kv-store.ts (records), so that the public path
 * (resolvePublicMedia in src/lib/media.ts) can serve it. The factory
 * never serves a media byte itself.
 *
 * Authority access is dependency-injected. Production callers omit
 * `deps` and get the real authorities via lazy import (no network at
 * import time); tests inject fakes and never touch KV or Blob.
 *
 * Binding is fail-closed and idempotent:
 * - unclear-reference-only rights, hotlink variant URLs, synthetic
 *   content identity, bytes/digest mismatch, or missing variants all
 *   throw BEFORE any byte is uploaded or any record is written;
 * - the same digest binds to the same media id; re-binding an already
 *   bound digest returns the existing receipt without re-uploading.
 *
 * No hardcoded URLs: every served URL in the saved record is exactly
 * what the blob authority returned for the uploaded bytes.
 */

import { sha256Hex } from "../../lib/ping/digest";
import type {
  Media,
  MediaRole,
  PublishedMediaAsset,
} from "../../types/media";
import {
  MEDIA_MODULE_VERSION,
  isAcquirable,
  type FydMediaObject,
  type FydMediaRole,
} from "./types";

/** A pipeline-generated derivative, with its bytes, for binding. */
export interface BindableVariant {
  /** Variant name: "thumbnail" | "card" | "hero" | "blur" | ... */
  name: string;
  /** The derivative bytes. sha256 must equal `digest`. */
  bytes: Buffer;
  width: number;
  height: number;
  /** sha256 hex of `bytes`. */
  digest: string;
}

/** Everything the binding stage needs: the validated pipeline object plus the bytes it names. */
export interface BindableAsset {
  media: FydMediaObject;
  /** The fetched original bytes. sha256 must equal media.digest. */
  originalBytes: Buffer;
  /** Derivative bytes, one per pipeline variant (blur included). */
  variants: BindableVariant[];
}

export interface BlobUploadReceipt {
  url: string;
  uploadedAt: string;
  alreadyExisted: boolean;
  contentHash: string;
}

/** The authority surface the binding consumes. Inject for tests. */
export interface AuthorityBindingDeps {
  uploadToBlob: (
    buffer: Buffer,
    filename: string,
    contentType: string,
  ) => Promise<BlobUploadReceipt>;
  findMediaByContentHash: (contentHash: string) => Promise<Media | null>;
  saveMedia: (media: Media) => Promise<void>;
}

export interface MediaBindingReceipt {
  mediaId: string;
  contentHash: string;
  alreadyExisted: boolean;
  /** Variant name -> authority-issued URL (exactly what the blob authority returned). */
  urls: Record<string, string>;
  boundAt: string;
}

export class MediaBindingError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super("[media-binding] " + reason + ": " + message);
    this.name = "MediaBindingError";
    this.reason = reason;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const REMOTE_URL = /^https?:\/\//i;


/** The authority's constitutional check, mirrored: a digest that is just sha256(id) is synthetic identity. */
function isSyntheticContentHash(id: string, digest: string): boolean {
  return sha256Hex(id) === digest;
}

/** Factory roles -> PING media roles. The factory's finer vocabulary collapses honestly. */
const ROLE_MAP: Record<FydMediaRole, MediaRole> = {
  hero: "hero",
  gallery: "gallery",
  logo: "logo",
  card: "detail",
  service: "detail",
  team: "portrait",
  location: "detail",
  project: "detail",
  thumbnail: "detail",
};

function contentTypeFor(format: string): string {
  const f = format.toLowerCase();
  if (f === "jpeg" || f === "jpg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  if (f === "avif") return "image/avif";
  if (f === "gif") return "image/gif";
  return "application/octet-stream";
}

function extensionFor(format: string): string {
  const f = format.toLowerCase();
  if (f === "jpeg" || f === "jpg") return "jpg";
  if (f === "png") return "png";
  if (f === "webp") return "webp";
  if (f === "avif") return "avif";
  if (f === "gif") return "gif";
  return "bin";
}

function orientationFor(width: number, height: number): "landscape" | "portrait" | "square" {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

/** Validate the asset BEFORE any byte moves. Throws MediaBindingError. */
function validateBindable(asset: BindableAsset): void {
  const media = asset.media;
  if (!isAcquirable(media.rightsSource)) {
    throw new MediaBindingError(
      "rights",
      "rightsSource '" +
        media.rightsSource +
        "' is not acquirable; the bytes must never be bound",
    );
  }
  if (!HEX64.test(media.digest)) {
    throw new MediaBindingError("digest", "digest must be 64-char lowercase hex sha256");
  }
  if (isSyntheticContentHash(media.id, media.digest)) {
    throw new MediaBindingError(
      "synthetic-identity",
      "digest is sha256(media id), not sha256 of actual bytes; synthetic content identity is never bound",
    );
  }
  if (sha256Hex(asset.originalBytes) !== media.digest) {
    throw new MediaBindingError(
      "bytes-mismatch",
      "original bytes do not sha256-match the media digest; content-addressed identity is required",
    );
  }
  if (!media.rightsBasis || !media.rightsBasis.trim()) {
    throw new MediaBindingError("rights", "rightsBasis must be a non-empty sentence");
  }
  if (!asset.variants || asset.variants.length === 0) {
    throw new MediaBindingError("variants", "at least one derivative variant is required");
  }
  for (const v of asset.variants) {
    if (!HEX64.test(v.digest)) {
      throw new MediaBindingError("digest", "variant '" + v.name + "' digest must be 64-char hex");
    }
    if (sha256Hex(v.bytes) !== v.digest) {
      throw new MediaBindingError(
        "bytes-mismatch",
        "variant '" + v.name + "' bytes do not sha256-match its digest",
      );
    }
    if (v.width <= 0 || v.height <= 0) {
      throw new MediaBindingError("variants", "variant '" + v.name + "' has non-positive dimensions");
    }
  }
  // No hotlinking as architecture: the binding only binds bytes the
  // pipeline produced. A remote URL in the declared variants means the
  // input is not pipeline-owned bytes, so the bind is refused outright.
  for (const v of media.variants ?? []) {
    if (REMOTE_URL.test(v.url)) {
      throw new MediaBindingError(
        "hotlink",
        "variant '" +
          v.name +
          "' declares a remote URL (" +
          v.url +
          "); binding binds owned bytes, never hotlinks",
      );
    }
  }
}

/** Rebuild the name -> URL map from an already-bound authority record. */
function urlsFromRecord(record: Media): Record<string, string> {
  const urls: Record<string, string> = {};
  const variants = (record as PublishedMediaAsset).variants;
  if (!variants) return urls;
  if (variants.original) urls["original"] = variants.original;
  if (variants.webp) urls["webp"] = variants.webp;
  if (variants.thumbnail) urls["thumbnail"] = variants.thumbnail;
  for (const r of variants.responsive ?? []) {
    if (r.webp) urls["w" + r.width] = r.webp;
  }
  return urls;
}

async function defaultBindingDeps(): Promise<AuthorityBindingDeps> {
  // Lazy: importing this module never touches the network. The real
  // authorities load only when a caller binds without injected deps.
  const blob = (await import("../../lib/blob-storage")) as {
    uploadToBlob: AuthorityBindingDeps["uploadToBlob"];
  };
  const kv = (await import("../../lib/media-kv-store")) as {
    findMediaByContentHash: AuthorityBindingDeps["findMediaByContentHash"];
    saveMedia: AuthorityBindingDeps["saveMedia"];
  };
  return {
    uploadToBlob: (buffer, filename, contentType) =>
      blob.uploadToBlob(buffer, filename, contentType),
    findMediaByContentHash: (contentHash) => kv.findMediaByContentHash(contentHash),
    saveMedia: (media) => kv.saveMedia(media),
  };
}

/**
 * Bind a validated pipeline asset into the PING media authority.
 *
 * Uploads the original + derivative bytes to the blob authority
 * (content-addressed, idempotent), then saves a PublishedMediaAsset
 * record (lifecycle 'published', source 'local', storage 'blob') to
 * the KV authority. Returns the binding receipt.
 */
export async function bindMediaToAuthority(
  asset: BindableAsset,
  deps?: AuthorityBindingDeps,
): Promise<MediaBindingReceipt> {
  validateBindable(asset);
  const d = deps ?? (await defaultBindingDeps());
  const media = asset.media;

  // Idempotency: the digest IS the identity. An already-bound digest
  // returns the existing receipt; nothing is re-uploaded or re-saved.
  const existing = await d.findMediaByContentHash(media.digest);
  if (existing) {
    return {
      mediaId: existing.id,
      contentHash: media.digest,
      alreadyExisted: true,
      urls: urlsFromRecord(existing),
      boundAt: new Date().toISOString(),
    };
  }

  const urls: Record<string, string> = {};
  const responsive: Array<{ width: number; webp: string; avif: string }> = [];
  let blurDataUrl: string | undefined;

  // The original first: its URL is the asset's canonical address.
  const ext = extensionFor(media.originalFormat);
  const originalUpload = await d.uploadToBlob(
    asset.originalBytes,
    media.id + "-original." + ext,
    contentTypeFor(media.originalFormat),
  );
  urls["original"] = originalUpload.url;

  // Derivatives. The blur rendition is tiny by design; it travels as a
  // base64 data URL on the record (the PING MediaVariants.blur shape),
  // never as an uploaded blob.
  const named = asset.variants
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let widestWebp: { width: number; url: string } | null = null;
  for (const v of named) {
    if (v.name === "blur") {
      blurDataUrl = "data:image/webp;base64," + v.bytes.toString("base64");
      continue;
    }
    const upload = await d.uploadToBlob(
      v.bytes,
      media.id + "-" + v.name + "-" + v.width + "w.webp",
      "image/webp",
    );
    urls[v.name] = upload.url;
    responsive.push({ width: v.width, webp: upload.url, avif: "" });
    if (!widestWebp || v.width > widestWebp.width) {
      widestWebp = { width: v.width, url: upload.url };
    }
  }
  if (widestWebp) urls["webp"] = widestWebp.url;

  const roles: MediaRole[] = [];
  for (const r of media.roles ?? []) {
    const mapped = ROLE_MAP[r];
    if (mapped && !roles.includes(mapped)) roles.push(mapped);
  }

  const now = new Date().toISOString();
  const record: PublishedMediaAsset = {
    id: media.id,
    filename: media.id + "-original." + ext,
    type: "image",
    orientation: orientationFor(media.width, media.height),
    alt: (media.altText ?? "").trim() || media.title,
    description:
      media.rightsBasis +
      " Provenance: " +
      media.provenance.sourceUrl +
      " observed " +
      media.provenance.observedAt +
      ". Bound by " +
      MEDIA_MODULE_VERSION +
      ".",
    tags: ["fyd-media", media.rightsSource, MEDIA_MODULE_VERSION, ...(media.roles ?? [])],
    roles: roles.length > 0 ? roles : ["detail"],
    contentHash: media.digest,
    source: "local",
    lifecycleState: "published",
    storage: "blob",
    dimensions: { width: media.width, height: media.height },
    variants: {
      original: urls["original"],
      ...(urls["webp"] ? { webp: urls["webp"] } : {}),
      ...(urls["thumbnail"] ? { thumbnail: urls["thumbnail"] } : {}),
      ...(blurDataUrl ? { blur: blurDataUrl } : {}),
      responsive,
    },
    fileSize: asset.originalBytes.length,
    format: media.originalFormat,
    createdAt: now,
    uploadedAt: now,
  };

  await d.saveMedia(record);

  return {
    mediaId: media.id,
    contentHash: media.digest,
    alreadyExisted: false,
    urls,
    boundAt: now,
  };
}
