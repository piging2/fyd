/**
 * Entity-resolution SPIKE types (FYD sprint plan item 6).
 *
 * Compiler principle under test: deterministic software handles exact
 * matches; only ambiguous cases consume intelligence. The three tiers are
 * mutually exclusive and every decision carries provenance.
 */

/** Minimal entity surface the spike resolves on. */
export interface ResolveEntity {
  id: string;
  name: string;
  phone?: string;
  url?: string;
  address?: string;
  city?: string;
  trade?: string;
  source?: string;
}

export type Tier = "EXACT" | "AMBIGUOUS" | "UNMATCHED";

/** EXACT-tier rule names. Only these rules may produce a merge decision. */
export type ExactRule = "exact-url" | "exact-phone" | "exact-name-address";

export interface Provenance {
  /** Id of the candidate entity that was resolved. */
  candidateId: string;
  /** Corpus this decision was made against, e.g. "western-co-prospects.jsonl@318". */
  corpusRef: string;
  /** "rule:<name>" for EXACT, "scored" for AMBIGUOUS/UNMATCHED. */
  mechanism: string;
  /** Injected clock for determinism; defaults to the constant below in tests. */
  evaluatedAt: string;
  normalizerVersion: "spike-1";
}

export interface ExactDecision {
  tier: "EXACT";
  rule: ExactRule;
  /** Corpus entity ids that matched. Deterministic ascending order. */
  matchedIds: string[];
  /** Normalized values that proved the match, e.g. { url: "coppersmithplumbing.com" }. */
  evidence: Record<string, string>;
  provenance: Provenance;
}

export interface AmbiguousCandidate {
  id: string;
  score: number;
  /** Per-feature evidence the intelligence reviewer sees. */
  evidence: Record<string, string | number | boolean>;
}

export interface AmbiguousDecision {
  tier: "AMBIGUOUS";
  /** Never auto-merged. Reviewer (human or model) decides. */
  action: "intelligence-review";
  candidates: AmbiguousCandidate[];
  provenance: Provenance;
}

export interface UnmatchedDecision {
  tier: "UNMATCHED";
  provenance: Provenance;
}

export type ResolutionDecision = ExactDecision | AmbiguousDecision | UnmatchedDecision;

export const NORMALIZER_VERSION = "spike-1" as const;
