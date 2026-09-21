/**
 * FYD refresh lane: types for temporal observation, conflict, diff, and
 * dependency indexing.
 *
 * Every fact FYD keeps carries: value, source URL, source type, observation
 * time, evidence reference, and confidence. Website claims are graded
 * "website_statement" (an observation of what the site says, not a verified
 * fact). Nothing here writes to the PING journal; these are projection-side
 * structures that the Ask FYD proposal flow can consume.
 */

export type SourceKind = "website" | "facebook" | "synthetic";

export type ClaimGrade =
  | "website_statement" // observed on a website; not a verified fact
  | "provider_statement" // observed on an authorized provider listing
  | "synthetic_fixture"; // controlled synthetic data, never presented as real

export interface Claim {
  claimId: string;
  entityId: string;
  /** Field path, e.g. "name", "hours", "phone". */
  field: string;
  value: string;
  normalizedValue: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  /** ISO 8601 observation time. */
  observedAt: string;
  /** Pointer to the raw evidence (fetch log, fixture file, API response). */
  evidenceRef: string;
  /** 0..1 */
  confidence: number;
  grade: ClaimGrade;
  /** Human-readable label, e.g. "T2-real" or "synthetic-conflict-fixture". */
  label: string;
}

export interface Observation {
  observationId: string;
  observedAt: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  evidenceRef: string;
  /** "real" for genuine observations, "synthetic" for controlled fixtures. */
  provenance: "real" | "synthetic";
  claims: Claim[];
}

export type ConflictKind = "value_disagreement";

export interface Conflict {
  conflictId: string;
  entityId: string;
  field: string;
  kind: ConflictKind;
  /** Both claims are kept with their provenance. FYD never silently picks. */
  claims: [Claim, Claim];
  status: "open" | "resolved";
  detectedAt: string;
  surfaceText: string;
  resolution?: {
    winningClaimId: string;
    decidedBy: string;
    decidedAt: string;
    note: string;
  };
}

export interface Snapshot {
  snapshotId: string;
  capturedAt: string;
  provenance: "real" | "synthetic";
  sourceKind: SourceKind;
  sourceUrl: string;
  claims: Claim[];
}

export type ChangeType = "added" | "removed" | "changed";

export interface ChangeRecord {
  type: ChangeType;
  entityId: string;
  field: string;
  before?: Claim;
  after?: Claim;
}

/**
 * Normalize a claim value for comparison: case-fold, collapse whitespace,
 * unify dash variants, strip surrounding quotes and trailing punctuation.
 */
export function normalizeClaimValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[—–‐‑]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.,;:!]+$/g, "")
    .trim();
}

/** Group key for "same claim slot": one entity, one field. */
export function claimSlotKey(entityId: string, field: string): string {
  return entityId + "|" + field;
}
