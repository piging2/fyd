/**
 * Synthetic / demo media marking (fyd-media@2 lane-media).
 *
 * Rule: no fabricated photo is ever presented as real. AI-generated,
 * placeholder, or demo-mock imagery is marked at the point of minting,
 * and the mark travels with the record into the render caption.
 *
 * The pipeline's RightsSource vocabulary (types.ts) does not yet carry
 * a "synthetic" member (shared-file change: see harvest-note patch
 * proposal P1). Until that lands, this module is the marking authority:
 * synthetic assets are minted here, keyed by content digest, and the
 * render caption is composed by renderCaption(). The rest of the
 * pipeline needs no changes: a marked-synthetic asset is never a
 * FydMediaObject, so it can never enter a manifest or be served as a
 * pipeline photograph.
 *
 * Deterministic: pure functions, no network, no mutation.
 */

/** What kind of not-a-photograph this asset is. */
export type SyntheticKind = "ai-generated" | "placeholder" | "demo-mock";

/**
 * The honesty mark. caption is the human sentence shown at render;
 * minting with an empty caption throws: a synthetic asset without its
 * own sentence is not an honest mark.
 */
export interface SyntheticMark {
  kind: SyntheticKind;
  /** What generated it: model name, tool, or "hand-placed fixture". */
  generator: string;
  /** ISO 8601 creation time. */
  createdAt: string;
  /** Render sentence. Never empty. */
  caption: string;
  /** Reproducibility recipe (prompt, seed), when one exists. */
  recipe?: string;
}

/**
 * A digest-keyed media honesty record. synthetic null means "real
 * pipeline photograph": renderCaption returns the photo basis unchanged.
 */
export interface MarkedMedia {
  /** SHA-256 hex of the asset bytes (the same digest space as the pipeline). */
  digest: string;
  synthetic: SyntheticMark | null;
}

const KIND_SENTENCE: Record<SyntheticKind, string> = {
  "ai-generated": "AI-generated placeholder image. Not a photograph of this business.",
  placeholder: "Placeholder image. Not a photograph of this business.",
  "demo-mock": "Demo mock image. Not a photograph of this business.",
};

/** The render sentence for a synthetic kind. Exported so tests pin it. */
export function kindSentence(kind: SyntheticKind): string {
  return KIND_SENTENCE[kind];
}

function checkDigest(digest: string): void {
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("markSynthetic: digest must be a 64-char lowercase hex sha256");
  }
}

/**
 * Mint a synthetic media record. Throws when the digest is malformed
 * or the caption is empty: a synthetic asset without its own render
 * sentence is never minted.
 */
export function markSynthetic(digest: string, mark: SyntheticMark): MarkedMedia {
  checkDigest(digest);
  const caption = (mark.caption ?? "").trim();
  if (!caption) {
    throw new Error(
      "markSynthetic: synthetic media must carry its own render caption; empty captions are not honest marks",
    );
  }
  if (!mark.generator || !mark.generator.trim()) {
    throw new Error("markSynthetic: generator must name what produced the asset");
  }
  return {
    digest,
    synthetic: {
      kind: mark.kind,
      generator: mark.generator.trim(),
      createdAt: mark.createdAt,
      caption,
      ...(mark.recipe ? { recipe: mark.recipe } : {}),
    },
  };
}

/** Mark a digest as a real pipeline photograph (no synthetic mark). */
export function markPhotograph(digest: string): MarkedMedia {
  checkDigest(digest);
  return { digest, synthetic: null };
}

/** True when the record carries a synthetic mark. */
export function isMarkedSynthetic(m: MarkedMedia): boolean {
  return m.synthetic !== null;
}

/**
 * The render caption for a marked asset. Synthetic assets always render
 * with their kind sentence plus their own caption: the "not a
 * photograph" disclosure is structural, not optional. Real photographs
 * render the pipeline's photo basis unchanged.
 */
export function renderCaption(marked: MarkedMedia, photoBasis: string): string {
  if (!marked.synthetic) return photoBasis;
  return kindSentence(marked.synthetic.kind) + " " + marked.synthetic.caption;
}
