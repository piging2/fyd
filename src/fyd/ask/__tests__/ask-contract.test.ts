/**
 * Ask FYD binding contract (Nolan 2026-09-25, binding):
 * INPUT = QUESTION + CURRENT OBJECT + RELATED OBJECT SUBGRAPH + EVIDENCE
 *         + VIEWER CONTEXT + ALLOWED CAPABILITIES
 * OUTPUT = ANSWER + CLAIMS + EVIDENCE REFERENCES + UNCERTAINTIES
 *          + OPTIONAL PROPOSED ACTION
 *
 * contract.ts owns the output-side enforcement seam. These tests pin:
 * - contractClaimsFor maps internal classifications to the 3-class
 *   citation vocabulary without dropping unrecognized claims.
 * - assertAskAnswerContract accepts honest answers and refusals, and
 *   throws AskContractError on every structural dishonesty shape.
 * - end to end: answerAskFyd outcomes (answered + refused) pass the
 *   contract with the classes the route would serve.
 *
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs ask-contract
 */

import { answerAskFyd, type AskFydSuccess } from "../visitor-answer";
import {
  AskContractError,
  assertAskAnswerContract,
  contractClaimsFor,
} from "../contract";
import type { AskClaimClass } from "../visitor-answer";
import type {
  PingObject,
  PingRelationship,
} from "../../../lib/ping/types";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";
import type { SiteBundle } from "../../media/site-bundle";

function businessObject(): PingObject {
  return {
    id: "biz-1",
    schema: "ping.social.business@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Demo Shop",
    description: "A demo shop.",
    fields: {},
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://demo.test/",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function serviceObject(): PingObject {
  return {
    id: "svc-1",
    schema: "ping.social.service@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Repairs",
    description: "Repair work.",
    fields: { name: "Repairs" },
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://demo.test/",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function demoBundle(): SiteBundle {
  const business = businessObject();
  const svc = serviceObject();
  const rel: PingRelationship = {
    id: "rel-1",
    subject: business.id,
    predicate: "offers",
    object: svc.id,
    status: "active",
    createdAt: "2026-09-22T00:00:00.000Z",
  };
  const graph: ObjectGraph = { objects: [business, svc], relationships: [rel] };
  const spec = { ownerObjectId: business.id, pages: [] } as unknown as FYDSiteSpec;
  return {
    siteId: "demo-test",
    businessName: "Demo Shop",
    graph,
    spec,
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

function success(over: Partial<AskFydSuccess> = {}): AskFydSuccess {
  return {
    ok: true,
    answer: "Demo Shop is a demo shop. [1]",
    refusal: false,
    citations: [
      {
        n: 1,
        id: "ref-1",
        label: "business: Demo Shop",
        kind: "object",
        source: "The business website (https://demo.test/)",
        basis: "The site's own words (website statement, not verified fact)",
        lastChecked: "2026-09-22",
        claimClass: "SUPPORTED DIRECTLY",
      },
    ],
    objectRefs: [
      { objectId: "biz-1", label: "business: Demo Shop", claimClass: "SUPPORTED DIRECTLY" },
    ],
    evidenceRefs: [
      { n: 1, id: "ref-1", label: "business: Demo Shop", kind: "object", claimClass: "SUPPORTED DIRECTLY" },
    ],
    sourceRefs: [{ source: "The business website (https://demo.test/)", lastChecked: "2026-09-22" }],
    unknowns: [],
    suggestedActions: [],
    proposal: null,
    claimClassifications: [
      { claim: "Demo Shop is a demo shop", classification: "DIRECT_FACT", evidenceRefIds: ["ref-1"] },
    ],
    ...over,
  };
}

describe("ask contract claims", () => {
  test("contractClaimsFor maps classifications to the 3-class vocabulary", () => {
    const claims = contractClaimsFor([
      { claim: "a", classification: "DIRECT_FACT", evidenceRefIds: ["r1"] },
      { claim: "b", classification: "DERIVED_FACT", evidenceRefIds: ["r2"] },
      { claim: "c", classification: "INFERENCE", evidenceRefIds: [] },
      { claim: "d", classification: "GENERATED_COPY", evidenceRefIds: [] },
      { claim: "e", classification: "CONFLICT", evidenceRefIds: ["r3"] },
    ]);
    const byClaim = new Map(claims.map((c) => [c.claim, c.claimClass]));
    expect(byClaim.get("a")).toBe("SUPPORTED DIRECTLY");
    expect(byClaim.get("b")).toBe("DERIVED");
    expect(byClaim.get("c")).toBe("DERIVED");
    expect(byClaim.get("d")).toBe("DERIVED");
    expect(byClaim.get("e")).toBe("CONFLICTED");
  });

  test("unrecognized classifications are surfaced, never dropped", () => {
    const claims = contractClaimsFor([
      { claim: "mystery claim", classification: "FUTURE_CLASS", evidenceRefIds: ["r1"] },
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].claim).toBe("mystery claim");
    expect(claims[0].evidenceRefIds).toEqual(["r1"]);
  });
});

describe("assertAskAnswerContract", () => {
  test("accepts a well-formed answered outcome", () => {
    const outcome = success();
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).not.toThrow();
  });

  test("accepts a well-formed refusal: UNSUPPORTED / UNKNOWN, no citations, no proposal", () => {
    const outcome = success({
      answer: "I do not have evidence for that in the current context, so I will not guess.",
      refusal: true,
      citations: [],
      objectRefs: [],
      evidenceRefs: [],
      claimClassifications: [],
      unknowns: ["septic tank pumping"],
    });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "UNSUPPORTED",
        answerState: "UNKNOWN",
        claims: [],
      }),
    ).not.toThrow();
  });

  test("refusal with a non-UNSUPPORTED class is a violation", () => {
    const outcome = success({ refusal: true, citations: [], claimClassifications: [] });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: [],
      }),
    ).toThrow(AskContractError);
  });

  test("refusal with citations attached is a violation", () => {
    const outcome = success({ refusal: true });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "UNSUPPORTED",
        answerState: "UNKNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).toThrow(/citations/);
  });

  test("refusal with a proposed action attached is a violation", () => {
    const outcome = success({
      refusal: true,
      citations: [],
      claimClassifications: [],
      proposal: { kind: "site_patch" } as unknown as AskFydSuccess["proposal"],
    });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "UNSUPPORTED",
        answerState: "UNKNOWN",
        claims: [],
      }),
    ).toThrow(/proposed action/);
  });

  test("non-refusal with no citations is a violation", () => {
    const outcome = success({ citations: [], evidenceRefs: [], claimClassifications: [] });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: [],
      }),
    ).toThrow(/no citations/);
  });

  test("citation with an invalid claim class is a violation", () => {
    const outcome = success();
    outcome.citations[0].claimClass = "PROBABLY_TRUE" as AskClaimClass;
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).toThrow(/invalid claimClass/);
  });

  test("coarse state drift from the fine class is a violation", () => {
    const outcome = success();
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "CONFLICTED",
        answerState: "KNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).toThrow(/answerState/);
  });

  test("a claim citing unserved evidence is a violation", () => {
    const outcome = success();
    outcome.claimClassifications = [
      { claim: "Demo Shop is a demo shop", classification: "DIRECT_FACT", evidenceRefIds: ["ghost-ref"] },
    ];
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).toThrow(/unserved evidence/);
  });

  test("empty answer text is a violation", () => {
    const outcome = success({ answer: "   " });
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims: contractClaimsFor(outcome.claimClassifications),
      }),
    ).toThrow(/empty/);
  });
});

describe("contract end to end over answerAskFyd", () => {
  test("answered outcome passes the contract", () => {
    const outcome = answerAskFyd(
      {
        siteId: "demo-test",
        question: "What services does this business offer, and how do you know?",
        mode: "visitor",
      },
      { loadBundle: () => demoBundle() },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok outcome");
    expect(outcome.refusal).toBe(false);
    expect(outcome.citations.length).toBeGreaterThan(0);
    const claims = contractClaimsFor(outcome.claimClassifications);
    expect(claims.length).toBeGreaterThan(0);
    // Every served claim must be recoverable to a served evidence ref.
    const servedIds = new Set(outcome.evidenceRefs.map((r) => r.id));
    for (const claim of claims) {
      for (const refId of claim.evidenceRefIds) {
        expect(servedIds.has(refId)).toBe(true);
      }
    }
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "SUPPORTED DIRECTLY",
        answerState: "KNOWN",
        claims,
      }),
    ).not.toThrow();
  });

  test("refused outcome passes the contract as UNSUPPORTED / UNKNOWN", () => {
    const outcome = answerAskFyd(
      { siteId: "demo-test", question: "Do you offer septic tank pumping?", mode: "visitor" },
      { loadBundle: () => demoBundle() },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok outcome");
    expect(outcome.refusal).toBe(true);
    expect(outcome.citations).toHaveLength(0);
    expect(outcome.proposal).toBeNull();
    expect(() =>
      assertAskAnswerContract({
        outcome,
        answerClass: "UNSUPPORTED",
        answerState: "UNKNOWN",
        claims: [],
      }),
    ).not.toThrow();
  });
});
