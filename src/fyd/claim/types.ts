/**
 * Resource-claim model (onboarding order J).
 *
 * A FYD website is a RESOURCE CLAIM, not a login provider. Typing a URL is
 * NOT proof of ownership. Three states, modeled distinctly:
 *
 * - OBSERVED: public evidence exists (a generated preview); no ownership
 *   is claimed by anyone.
 * - CLAIMED: an authenticated identity asserts control; no proof yet.
 * - VERIFIED-CONTROLLED: a verification proof exists via the verification
 *   seam (verification-seam.ts).
 *
 * State is evidence-bearing: every transition appends an audit event to
 * history, and the history is part of the persisted record.
 */

export type ClaimState = "observed" | "claimed" | "verified-controlled";

export type VerificationMethod =
  | "dns-txt"
  | "well-known-file"
  | "html-meta-tag"
  | "cms-integration"
  | "provider-evidence"
  | "operator-attestation";

/** Identity kinds. "google" is reserved for the auth lane's real adapter. */
export type IdentityKind = "demo-owner" | "google";

export interface ClaimedIdentity {
  kind: IdentityKind;
  actorId: string;
  actorLabel: string;
  /** ISO timestamp of when the identity was established. */
  authenticatedAt: string;
  /** Honest provenance: how this identity was established. */
  authNote: string;
}

export interface VerificationProof {
  method: VerificationMethod;
  verifiedAt: string;
  /** Actor label that produced the proof. */
  verifiedBy: string;
  /** Human-readable basis for the proof. */
  basis: string;
  /**
   * Method-specific artifacts (token digests, file paths, attestation refs).
   * Never secrets.
   */
  artifacts: Record<string, string>;
  /** Honest limitation note; operator attestation is not cryptographic proof. */
  proofNote: string;
}

export type ClaimEventType =
  | "observed-created"
  | "claimed"
  | "verify-attempt"
  | "verified"
  | "released";

export interface ClaimEvent {
  at: string;
  /** Actor label, or "system"/"anonymous". */
  actor: string;
  type: ClaimEventType;
  detail: string;
}

export interface ResourceClaim {
  version: 1;
  resourceId: string;
  kind: "fyd-site";
  state: ClaimState;
  /** The public URL this resource was observed at, if any. */
  sourceUrl: string | null;
  observedAt: string;
  claimedBy: ClaimedIdentity | null;
  verification: VerificationProof | null;
  history: ClaimEvent[];
}

/** Typed failure for the claim state machine. Fail closed, never half-applied. */
export class ClaimError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ClaimError";
    this.code = code;
  }
}
