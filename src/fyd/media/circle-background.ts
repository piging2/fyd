/**
 * FYD circle background resolver (server-only: node:fs / node:crypto).
 *
 * resolveCircleBackground(objectId) picks the circle's background:
 * - If the media manifest holds a pipeline-acquired asset with role "hero"
 *   or "gallery", use its smallest variant (the "blur" rendition when
 *   present, else the smallest by bytes) as the background. basis:
 *   "Website photo, tiny optimized derivative".
 * - Otherwise fall back to a deterministic gradient derived from
 *   sha256(objectId): hue from a warm artisan palette (hues 18..42), css =
 *   radial-gradient(circle at 35% 30%, hsl(H 45% 62%), hsl(H-12 50% 38%)).
 *   basis: "Deterministic fallback, no acquired site media".
 *
 * Deterministic: same objectId -> byte-identical result. No network calls,
 * no randomness. observedAt is the first media entry's observation date;
 * when the site has no acquired media it is the manifest's generation
 * timestamp (a real pipeline observation, never invented).
 */

import { createHash } from "node:crypto";
import type { CircleBackground } from "../object/types";
import { getPipelineManifest } from "./bundle-media";
import { isAcquirable, type FydMediaObject } from "./types";

const IMAGE_BASIS = "Website photo, tiny optimized derivative";
export const GRADIENT_BASIS = "Deterministic fallback, no authorized site media";

// Warm artisan palette: hue 18 (burnt orange) through 42 (amber).
const HUE_MIN = 18;
const HUE_SPAN = 25; // 18..42 inclusive

/** Smallest variant: the "blur" rendition when present, else smallest by bytes. */
function pickSmallestVariant(
  variants: FydMediaObject["variants"],
): FydMediaObject["variants"][number] | null {
  if (variants.length === 0) return null;
  const blur = variants.find((v) => v.name.startsWith("blur"));
  if (blur) return blur;
  return variants.reduce((a, b) => (b.bytes < a.bytes ? b : a));
}

/**
 * Deterministic warm gradient from sha256(objectId).
 * hue = 18 + (first digest byte mod 25), i.e. hues 18..42.
 */
export function gradientFor(objectId: string): { css: string; digest: string } {
  const hash = createHash("sha256").update(objectId, "utf8").digest();
  const hue = HUE_MIN + hash[0] % HUE_SPAN;
  const css =
    "radial-gradient(circle at 35% 30%, hsl(" +
    hue +
    " 45% 62%), hsl(" +
    (hue - 12) +
    " 50% 38%))";
  return { css, digest: hash.toString("hex") };
}

export function resolveCircleBackground(objectId: string): CircleBackground {
  // One truth: the pipeline manifest store, rights-gated. Reference-only
  // assets never qualify: the rights gate acquires nothing with unclear
  // provenance.
  const manifest = getPipelineManifest(objectId);
  const entries = manifest?.media ?? [];
  // observedAt: the first media entry's observation; when the site has no
  // acquired media, the manifest's own generation timestamp (a real
  // pipeline observation, not an invented date).
  const manifestObservedAt =
    entries[0]?.provenance?.observedAt ?? manifest?.generatedAt ?? "";

  // First acquired media with a hero or gallery role, in manifest order.
  const hero = entries.find(
    (m) =>
      !!m.rightsSource &&
      isAcquirable(m.rightsSource) &&
      (m.roles ?? []).some((r) => r === "hero" || r === "gallery"),
  );
  const smallest = hero ? pickSmallestVariant(hero.variants ?? []) : null;
  if (hero && smallest) {
    return {
      kind: "image",
      src: smallest.url,
      digest: hero.digest ?? "",
      observedAt: hero.provenance?.observedAt ?? manifestObservedAt,
      basis: IMAGE_BASIS,
    };
  }

  const { css, digest } = gradientFor(objectId);
  return {
    kind: "gradient",
    css,
    digest,
    observedAt: manifestObservedAt,
    basis: GRADIENT_BASIS,
  };
}
