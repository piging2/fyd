/**
 * TRACK C (website builder harvest), 2026-09-28.
 * The approval seam: the ONE semantic approval operation.
 *
 * CANONICAL AUTHORITY (do not duplicate): the Phase 1 human-authority
 * seam, branch `phase1/approval-door-2026-09-28`, source
 * `src/fyd/approval/types.ts` (OwnerProposal), `src/fyd/approval/gate.ts`
 * (decideApproval), `src/fyd/approval/journal.ts` (typed journal events).
 * The Phase 1 coordinator owns that branch and its contract.
 *
 * THIS FILE IS AN ADAPTER, NOT AN AUTHORITY. It emits SitePatch
 * proposals in the exact Phase 1 OwnerProposal shape so that SitePatch
 * converges with Phase 1 on one semantic approval operation: the same
 * proposal bytes, the same digest, the same decision, the same event.
 * It never decides, never approves, never mutates. The decision belongs
 * to the Phase 1 gate alone.
 *
 * BINDING STATUS: PENDING. The Phase 1 contract is available as a draft
 * (worktree /home/nolan/worktrees/phase1-approval-door, HEAD 5f4f38bd,
 * read-only). This adapter mirrors that draft's shape; the binding is
 * confirmed only when the Phase 1 coordinator accepts proposals emitted
 * through this seam. Until then, emitted records are marked
 * `seam: "trackc-sitepatch/pending-phase1-binding"`.
 *
 * Digest law (shared with Phase 1 and the overlay domain):
 * algorithm sha256-canonical-json-v1: keys sorted recursively (UTF-16
 * code-unit order), compact JSON (JSON.stringify, non-ASCII raw), UTF-8,
 * SHA-256 hex. Volatile keys excluded: proposalDigest, createdAt,
 * generatedAt, nonce, requested_at, proposal_digest. The overlay
 * proposalDigest (src/fyd/proceduralize/patch.ts) already uses exactly
 * this algorithm, so the gate's proposed_digest reuses it verbatim:
 * same bytes, same algorithm, same digest.
 *
 * No em dashes in user-facing strings (standing rule).
 */

import { sha256Hex } from "../proceduralize/sha256";
import { canonicalize } from "@/lib/ping/ask-composer";
import type { SitePatchBody } from "../proceduralize/patch";

/** Evidence classification vocabulary (binding, mirrored from Phase 1). */
export type SeamEvidenceClassification =
  | "DIRECT"
  | "DERIVED"
  | "INFERRED"
  | "GENERATED_PRESENTATION"
  | "OWNER_ASSERTED";

export interface SeamEvidenceRef {
  ref: string;
  classification: SeamEvidenceClassification;
}

export type SeamProposalStatus =
  | "PROPOSED"
  | "APPROVED"
  | "DENIED"
  | "EXPIRED"
  | "SUPERSEDED";

export type SeamApprovalVerdict = "APPROVE" | "DENY";

/**
 * Type-level mirror of the Phase 1 OwnerProposal contract
 * (phase1/approval-door-2026-09-28: src/fyd/approval/types.ts).
 * Field names and semantics are identical; only the seam marker is
 * added. If the Phase 1 contract changes, THIS mirror is updated to
 * match; it never evolves independently.
 */
export interface SeamOwnerProposal {
  proposal_id: string;
  tenant_id: string;
  actor_id: string;
  target_object_id: string;
  operation: string;
  /** sha256 hex of the canonical source (spec) bytes at proposal time. */
  base_digest: string;
  /** sha256 hex of the canonical patch bytes (volatile keys excluded). */
  proposed_digest: string;
  /** The exact typed delta, bytes-inspectable. */
  patch: Record<string, unknown>;
  evidence_refs: SeamEvidenceRef[];
  required_capability: string;
  consequence_class?: "LOW" | "MEDIUM" | "HIGH";
  created_at: string;
  expires_at: string | null;
  status: SeamProposalStatus;
  /** ONE SENTENCE: what approving would do. */
  decision_sentence: string;
  /** ONE LINK: the primary evidence ref. */
  evidence_link: string;
  /** Seam marker: this record was emitted for the Phase 1 gate. */
  seam: "trackc-sitepatch/pending-phase1-binding";
}

export interface EmitGateProposalArgs {
  siteId: string;
  tenantId: string;
  actorId: string;
  /** The site object the patch targets (the business/root object id). */
  targetObjectId: string;
  /** SitePatch op kind, e.g. "MOVE_SECTION". */
  operation: string;
  /** The exact spec bytes the proposal was drafted against. */
  baseSpec: unknown;
  /** The validated, digest-bound overlay proposal. */
  proposal: SitePatchBody;
  /** One sentence: what approving would do. */
  decisionSentence: string;
  /** One link: the primary evidence ref. */
  evidenceLink: string;
  evidenceRefs?: SeamEvidenceRef[];
  requiredCapability?: string;
  /** ISO-8601 UTC. Defaults to the current clock; inject for determinism. */
  nowIso?: string;
}

/**
 * Emit a SitePatch proposal through the approval seam: a record in the
 * exact Phase 1 OwnerProposal shape. Pure except for the injectable
 * clock. The proposal_id is deterministic: "spp-" + sha256 hex of
 * siteId + "|" + proposed_digest, so the same proposal emitted twice is
 * the same record.
 */
export function emitGateProposal(args: EmitGateProposalArgs): SeamOwnerProposal {
  const proposedDigest = args.proposal.proposalDigest;
  const proposalId =
    "spp-" + sha256Hex(args.siteId + "|" + proposedDigest).slice(0, 16);
  const baseDigest = sha256Hex(canonicalize(args.baseSpec));
  return {
    proposal_id: proposalId,
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    target_object_id: args.targetObjectId,
    operation: args.operation,
    base_digest: baseDigest,
    proposed_digest: proposedDigest,
    patch: args.proposal as unknown as Record<string, unknown>,
    evidence_refs: args.evidenceRefs ?? [
      { ref: args.evidenceLink, classification: "GENERATED_PRESENTATION" },
    ],
    required_capability: args.requiredCapability ?? "owner.customize-approve",
    created_at: args.nowIso ?? new Date().toISOString(),
    expires_at: null,
    status: "PROPOSED",
    decision_sentence: args.decisionSentence,
    evidence_link: args.evidenceLink,
    seam: "trackc-sitepatch/pending-phase1-binding",
  };
}

export type GateDecisionOutcome =
  | { ok: true; proposal: SeamOwnerProposal; verdict: SeamApprovalVerdict }
  | { ok: false; error: "digest_mismatch" | "already_decided" | "expired" };

/**
 * The exact-digest verification the gate performs (mirrored here for
 * tests and for the seam's documented behavior; the real decision
 * authority is the Phase 1 gate). The presented digest must equal the
 * recorded proposed_digest by exact string equality. A mismatch changes
 * nothing.
 */
export function verifyGateDecision(
  proposal: SeamOwnerProposal,
  presentedDigest: string,
  verdict: SeamApprovalVerdict,
): GateDecisionOutcome {
  if (proposal.status !== "PROPOSED") {
    return { ok: false, error: "already_decided" };
  }
  if (presentedDigest !== proposal.proposed_digest) {
    return { ok: false, error: "digest_mismatch" };
  }
  return {
    ok: true,
    proposal: {
      ...proposal,
      status: verdict === "APPROVE" ? "APPROVED" : "DENIED",
    },
    verdict,
  };
}
