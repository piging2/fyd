/**
 * Generated treatment for the no-media case (fyd-media@2 lane-media).
 *
 * Rule: no fabricated photo is ever presented as real, and no surface
 * ever renders a broken image. When the authority projection finds no
 * approved media for an object, the hero resolves to a GENERATED
 * TREATMENT: a deterministic visual derived from the object's own
 * tokens (palette + initial + foreground, see media-tokens.ts).
 *
 * The treatment carries NO image URL, NO src, NO remote reference of
 * any kind: it is structurally incapable of being a broken image. The
 * caption and basis say plainly that this is not a photograph.
 *
 * Deterministic: same objectId + title -> byte-identical treatment.
 * Pure functions, no network, no randomness.
 */

import {
  foregroundForLightness,
  gradientCss,
  paletteFor,
  tokenDigest,
} from "./media-tokens";

export interface GeneratedTreatment {
  kind: "generated-treatment";
  objectId: string;
  title: string;
  /** Display initial derived from the object title. */
  initial: string;
  /** CSS background for the treatment surface. */
  css: string;
  /** Brand foreground token for text drawn on the treatment. */
  foreground: string;
  /** Short human caption, always carrying the not-a-photograph disclosure. */
  caption: string;
  /** Machine/human basis sentence. Never empty. */
  basis: string;
  /** Deterministic token recipe (seed + digest), for reproducibility. */
  tokens: { seed: string; digest: string; hue: number };
}

export const GENERATED_TREATMENT_BASIS =
  "Generated treatment. No authorized photography exists for this object. " +
  "The visual is derived deterministically from the object's own tokens. " +
  "Not a photograph of the business.";

/**
 * Build the generated treatment for an object with no approved media.
 * Deterministic: same inputs -> identical output, byte for byte.
 */
export function generatedTreatmentFor(input: {
  objectId: string;
  title: string;
}): GeneratedTreatment {
  const seed = input.objectId + "\n" + input.title;
  const digest = tokenDigest(seed);
  const palette = paletteFor(seed);
  const first = input.title.trim()[0];
  const initial = (typeof first === "string" ? first : "").toUpperCase() || "?";
  return {
    kind: "generated-treatment",
    objectId: input.objectId,
    title: input.title,
    initial,
    css: gradientCss(palette),
    foreground: foregroundForLightness(palette.light),
    caption: "Generated visual. Not a photograph of this business.",
    basis: GENERATED_TREATMENT_BASIS,
    tokens: { seed, digest, hue: palette.hue },
  };
}
