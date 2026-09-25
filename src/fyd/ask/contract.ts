/**
 * Ask FYD binding contract (Nolan 2026-09-25, binding).
 *
 * INPUT  = QUESTION + CURRENT OBJECT + RELATED OBJECT SUBGRAPH + EVIDENCE
 *          + VIEWER CONTEXT + ALLOWED CAPABILITIES.
 * OUTPUT = ANSWER + CLAIMS + EVIDENCE REFERENCES + UNCERTAINTIES
 *          + OPTIONAL PROPOSED ACTION.
 *
 * This module is the enforcement seam for the output side of that
 * contract: it types the contract and asserts it deterministically on
 * every served answer. It owns no truth (truth stays upstream in
 * objects/evidence/events) and no new authority: it checks the answer the
 * pipeline produced against the support-class contract the pipeline
 * already claims. A violation is a pipeline bug, so the route fails
 * closed as honest-unknown instead of serving a structurally dishonest
 * answer.
 *
 * Pure + deterministic. No loader, no network, no clock, no model.
 */

import {
  answerStateFor,
  claimClassFor,
  type AskAnswerClass,
  type AskAnswerState,
  type AskClaimClass,
  type AskFydCitation,
  type AskFydEvidenceRef,
  type AskFydObjectRef,
  type AskFydSourceRef,
  type AskFydSuccess,
} from "./visitor-answer";
import type { AskClaimClassification, AskProposal } from "../../lib/ping/types";

/** The six contract inputs Ask FYD reasons under. */
export interface AskFydQueryInput {
  /** QUESTION: the visitor's question, trimmed, max-length enforced. */
  question: string;
  /** CURRENT OBJECT: the object the question is about (public projection). */
  currentObject: { id: string; schema: string; title: string };
  /** RELATED OBJECT SUBGRAPH: the 1-hop related objects + active edges. */
  relatedObjectSubgraph: {
    objects: { id: string; schema: string; title: string }[];
    relationships: { id: string; subject: string; predicate: string; object: string }[];
  };
  /** EVIDENCE: the evidence refs the composer may cite. */
  evidence: { id: string; label: string; kind: "field" | "object" | "relationship" }[];
  /** VIEWER CONTEXT: who is asking and in what mode. */
  viewerContext: { viewerId: string | null; mode: "visitor" | "owner" };
  /** ALLOWED CAPABILITIES: the grants the answer may act under ([] for visitors). */
  allowedCapabilities: string[];
}

/** One claim the answer makes, with its support class and evidence. */
export interface AskFydClaim {
  /** The claim text as stated in the answer. */
  claim: string;
  /** The 5-class support class mapped to the 3-class citation vocabulary. */
  claimClass: AskClaimClass;
  /** Ids into the answer's evidence references supporting this claim. */
  evidenceRefIds: string[];
}

/** The five contract outputs of one served Ask FYD answer. */
export interface AskFydAnswerContract {
  /** ANSWER: the composed text. */
  answer: string;
  /** CLAIMS: each factual claim with its support class and evidence. */
  claims: AskFydClaim[];
  /** EVIDENCE REFERENCES: structured refs the answer stands on. */
  evidenceReferences: {
    objects: AskFydObjectRef[];
    evidence: AskFydEvidenceRef[];
    sources: AskFydSourceRef[];
  };
  /** UNCERTAINTIES: what the question asked about with no supporting evidence. */
  uncertainties: string[];
  /** OPTIONAL PROPOSED ACTION: a draft proposal, or null. */
  proposedAction: AskProposal | null;
}

/**
 * Reduce the internal claim groupings to the contract CLAIMS output. A
 * classification the pipeline does not recognize is still surfaced (never
 * dropped); claimClassFor maps it, and the claim text stays visible so a
 * reviewer can see exactly what the answer asserted.
 */
export function contractClaimsFor(
  claimClassifications: AskClaimClassification[],
): AskFydClaim[] {
  return claimClassifications.map((cc) => ({
    claim: cc.claim,
    claimClass: claimClassFor(cc.classification),
    evidenceRefIds: [...cc.evidenceRefIds],
  }));
}

/** Thrown when a served answer violates the binding contract. */
export class AskContractError extends Error {
  constructor(reason: string) {
    super(`Ask FYD contract violation: ${reason}. The answer was refused instead of served.`);
    this.name = "AskContractError";
  }
}

const CITATION_CLASSES: readonly AskClaimClass[] = [
  "SUPPORTED DIRECTLY",
  "DERIVED",
  "CONFLICTED",
];

/**
 * Assert the output side of the binding contract on one served answer.
 *
 * - A refusal must be answerClass UNSUPPORTED / answerState UNKNOWN, with
 *   no citations and no proposed action: an honest unknown stands alone.
 * - A non-refusal answer must cite at least one evidence reference, every
 *   citation must carry a valid claim class, and the coarse state must be
 *   exactly answerStateFor(answerClass): the two layers may never drift.
 * - Every claim's evidenceRefIds must resolve to served evidence refs.
 *
 * Throws AskContractError on violation. The route turns that into an
 * honest-unknown 500, never a structurally dishonest answer.
 */
export function assertAskAnswerContract(args: {
  outcome: AskFydSuccess;
  answerClass: AskAnswerClass;
  answerState: AskAnswerState;
  claims: AskFydClaim[];
}): void {
  const { outcome, answerClass, answerState, claims } = args;
  if (outcome.answer.trim() === "") {
    throw new AskContractError("served answer text is empty");
  }
  if (outcome.refusal) {
    if (answerClass !== "UNSUPPORTED") {
      throw new AskContractError(
        `refusal served with answerClass "${answerClass}" instead of UNSUPPORTED`,
      );
    }
    if (answerState !== "UNKNOWN") {
      throw new AskContractError(
        `refusal served with answerState "${answerState}" instead of UNKNOWN`,
      );
    }
    if (outcome.citations.length > 0) {
      throw new AskContractError("refusal served with citations attached");
    }
    if (outcome.proposal !== null) {
      throw new AskContractError("refusal served with a proposed action attached");
    }
    return;
  }
  // Non-refusal: the answer must stand on cited evidence.
  if (outcome.citations.length === 0) {
    throw new AskContractError("non-refusal answer served with no citations");
  }
  const seenN = new Set<number>();
  for (const c of outcome.citations) {
    if (!CITATION_CLASSES.includes(c.claimClass)) {
      throw new AskContractError(`citation ${c.n} carries invalid claimClass "${c.claimClass}"`);
    }
    if (!Number.isInteger(c.n) || c.n < 1 || seenN.has(c.n)) {
      throw new AskContractError(`citation has invalid or duplicate marker n=${c.n}`);
    }
    seenN.add(c.n);
    if (typeof c.id !== "string" || c.id.trim() === "") {
      throw new AskContractError(`citation ${c.n} has an empty evidence id`);
    }
  }
  const expectedState = answerStateFor(answerClass);
  if (answerState !== expectedState) {
    throw new AskContractError(
      `answerState "${answerState}" does not equal answerStateFor("${answerClass}") = "${expectedState}"`,
    );
  }
  const evidenceIds = new Set(outcome.evidenceRefs.map((r) => r.id));
  for (const claim of claims) {
    if (claim.claim.trim() === "") {
      throw new AskContractError("served claim has empty claim text");
    }
    for (const refId of claim.evidenceRefIds) {
      if (!evidenceIds.has(refId)) {
        throw new AskContractError(
          `claim "${claim.claim.slice(0, 60)}" cites unserved evidence ref "${refId}"`,
        );
      }
    }
  }
  if (!Array.isArray(outcome.unknowns)) {
    throw new AskContractError("uncertainties (unknowns) is not an array");
  }
}

/**
 * Version of the served Ask FYD response envelope (Q-C-03). Bump when
 * the POST /api/fyd/ask response shape changes; inv-13 pins the current
 * value so a shape change without a bump fails the suite.
 */
export const ASK_RESPONSE_CONTRACT_VERSION = "fyd.ask-response@1";

/** Build the full contract view of one served answer (for tests/inspection). */
export function contractViewFor(outcome: AskFydSuccess): AskFydAnswerContract {
  return {
    answer: outcome.answer,
    claims: contractClaimsFor(outcome.claimClassifications),
    evidenceReferences: {
      objects: outcome.objectRefs,
      evidence: outcome.evidenceRefs,
      sources: outcome.sourceRefs,
    },
    uncertainties: outcome.unknowns,
    proposedAction: outcome.proposal,
  };
}
