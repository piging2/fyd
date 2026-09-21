/**
 * FYD derivative generator (sharp).
 *
 * HARVEST: rendition constants come from src/lib/media-constants.ts
 * (WEBP_QUALITY, THUMBNAIL_WIDTH/QUALITY, BLUR_WIDTH/QUALITY) — REUSE
 * as-is, never redefined here.
 *
 * MEDIA SAFETY (enforced, not documented):
 * - Actual bytes, not extensions: sharp parses magic bytes; a mislabeled
 *   file throws and the ingest records it "failed". SVG is rejected
 *   upstream by safeFetchImage's allowlist (image/svg+xml is executable
 *   vector content; we never execute source media).
 * - Bounds: source dimensions are capped (decompression-bomb guard);
 *   downloads are size/timeout/redirect-bounded in safe-fetch.
 * - Only the derivative sizes the product actually needs are generated:
 *   thumbnail 480w, card 768w, hero 1600w, blur 10w. No speculative
 *   responsive ladder, no AVIF (no consumer negotiates formats).
 *
 * Every variant records shape + proof (width/height/format + sha256 of its
 * bytes), per the media-contracts harvest. Files are content-addressed:
 * public/fyd-media/<sha256>/<name>-<width>w.<ext>. Re-ingesting identical
 * bytes regenerates identical paths (dedupe by digest).
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  BLUR_QUALITY,
  BLUR_WIDTH,
  THUMBNAIL_QUALITY,
  THUMBNAIL_WIDTH,
  WEBP_QUALITY,
} from "../../lib/media-constants";
import type { MediaFormat, MediaVariant } from "./types";

export interface DerivativePlan {
  name: string;
  width: number;
  format: MediaFormat;
  quality: number;
}

/**
 * The product's actual named sizes. The presence band, ObjectView, and
 * circle background consume exactly these; nothing wider is generated.
 */
const PRODUCT_WIDTHS = { thumbnail: THUMBNAIL_WIDTH, card: 768, hero: 1600 } as const;

/**
 * Source-dimension bomb guard. A source wider/taller than this, or with
 * more total pixels, is rejected (ingest records it "failed") rather than
 * decoded: the product never displays anything near this size.
 */
const MAX_SOURCE_DIMENSION = 8000;
const MAX_SOURCE_PIXELS = 64_000_000;

/**
 * Bounded derivative plan for a source of the given width. Deterministic:
 * same source width -> same plan. Never upscales.
 */
export function planDerivatives(sourceWidth: number): DerivativePlan[] {
  const plans: DerivativePlan[] = [];
  (Object.entries(PRODUCT_WIDTHS) as [string, number][]).forEach(([name, w]) => {
    if (w <= sourceWidth) plans.push({ name, width: w, format: "webp", quality: WEBP_QUALITY });
  });
  // Never upscale: if the source is narrower than every product size,
  // emit one rendition at the source width so small logos still work.
  if (plans.length === 0) {
    plans.push({ name: "thumbnail", width: sourceWidth, format: "webp", quality: THUMBNAIL_QUALITY });
  }
  plans.push({ name: "blur", width: Math.min(BLUR_WIDTH, sourceWidth), format: "webp", quality: BLUR_QUALITY });
  return plans;
}

export interface GeneratedDerivatives {
  variants: MediaVariant[];
  width: number;
  height: number;
  format: string;
}

/**
 * Generate derivatives for fetched image bytes. Writes files under
 * <publicDir>/<contentHash>/ and returns variant records with public URLs
 * rooted at <publicUrlRoot> (default "/fyd-media").
 */
export async function generateDerivatives(
  input: Buffer,
  contentHash: string,
  publicDir: string,
  publicUrlRoot = "/fyd-media",
): Promise<GeneratedDerivatives> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("Could not read image dimensions");
  // Decompression-bomb guard: reject absurd sources rather than decoding
  // them. The product never displays anything near these sizes.
  if (width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION) {
    throw new Error("Source dimensions " + width + "x" + height + " exceed the " + MAX_SOURCE_DIMENSION + "px bound");
  }
  if (width * height > MAX_SOURCE_PIXELS) {
    throw new Error("Source pixel count exceeds the " + MAX_SOURCE_PIXELS + " bound");
  }
  const format = (meta.format ?? "unknown").toLowerCase();

  const outDir = join(publicDir, contentHash);
  await mkdir(outDir, { recursive: true });

  const variants: MediaVariant[] = [];
  for (const plan of planDerivatives(width)) {
    const targetHeight = Math.round((height * plan.width) / width);
    let pipeline = sharp(input).resize(plan.width, targetHeight, { fit: "inside", withoutEnlargement: true });
    // The plan only ever emits webp. Anything else is a programmer error:
    // reject rather than improvise a format the product did not ask for.
    if (plan.format !== "webp") throw new Error("Unsupported derivative format: " + plan.format);
    pipeline = pipeline.webp({ quality: plan.quality });
    const out = await pipeline.toBuffer();
    const digest = createHash("sha256").update(out).digest("hex");
    const fileName = plan.name + "-" + plan.width + "w.webp";
    await writeFile(join(outDir, fileName), out);
    variants.push({
      name: plan.name,
      width: plan.width,
      height: targetHeight,
      format: plan.format,
      url: publicUrlRoot + "/" + contentHash + "/" + fileName,
      bytes: out.byteLength,
      digest,
      // Derived-asset relationship: this variant was produced from the
      // original bytes identified by contentHash. Explicit in data, so a
      // provenance query can cite which source each derivative came from.
      derivedFrom: contentHash,
    });
  }
  // Plans are already named for the product's sizes (thumbnail/card/hero/
  // blur); no alias layer.
  return { variants, width, height, format };
}

/** SHA-256 hex of content bytes. Server-side named wrapper (node:crypto). */
export function hashContentBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
