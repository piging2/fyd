/**
 * FYD-007 / FYD-027: the fixed Ask FYD services question must be answered
 * from graph evidence only.
 *
 * - Negative: a business whose description PROSE mentions services but
 *   whose graph carries zero service objects must get the honest refusal,
 *   never an invented service list.
 * - Positive: structured ping.social.service@1 objects linked by
 *   provides/offers relationships must be answered with citations,
 *   per-claim classifications, and source URLs.
 *
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs services-evidence
 */

import { buildAskFydContext } from "../context-builder";
import { composeAskFyd } from "../answer";
import { answerAskFyd } from "../visitor-answer";
import { assertAskAnswerContract, contractClaimsFor } from "../contract";
import type { SiteBundle } from "../../media/site-bundle";
import type { AskFydContextInput } from "../types";
import type {
  FydGrant,
  PingObject,
  PingRelationship,
} from "../../../lib/ping/types";

const QUESTION = "What services does this business offer, and how do you know?";

const VIEWER = { id: "visitor-test", displayName: null };
const GRANTS = ["site.read", "site.propose"] as FydGrant[];

function businessObject(): PingObject {
  return {
    id: "biz-1",
    schema: "ping.social.business@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Happy Place Carpentry LLC",
    description: "building decks, fences, pergolas, bathrooms, and custom work",
    fields: {},
    provenance: {
      kind: "website-ingestion",
      ref: "website-ingestion:https://happy-place-platform.vercel.app/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

function serviceObject(id: string, title: string): PingObject {
  return {
    id,
    schema: "ping.social.service@1",
    controllerId: "owner-test",
    visibility: "public",
    title,
    description: `${title} in the valley.`,
    fields: {},
    provenance: {
      kind: "website-ingestion",
      ref: "website-ingestion:https://happy-place-platform.vercel.app/services",
      derivedAt: "2026-09-21T13:50:00Z",
    },
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

function providesRel(id: string, biz: string, svc: string): PingRelationship {
  return {
    id,
    subject: biz,
    predicate: "provides",
    object: svc,
    status: "active",
    createdAt: "2026-09-21T00:00:00.000Z",
    evidenceRef: "website-ingestion:https://happy-place-platform.vercel.app/services",
  };
}

function ctxFor(
  target: PingObject,
  relatedObjects: PingObject[],
  relationships: PingRelationship[],
) {
  const input: AskFydContextInput = {
    viewer: VIEWER,
    target,
    relatedObjects,
    relationships,
    plan: null,
    grants: GRANTS,
    siteSpec: null,
    question: QUESTION,
  };
  return buildAskFydContext(input);
}

describe("Ask FYD services question: evidence-grounded answers (FYD-007)", () => {
  test("no service objects -> honest refusal, nothing invented from prose", () => {
    const target = businessObject();
    const ctx = ctxFor(target, [], []);
    const ans = composeAskFyd(ctx, QUESTION);

    expect(ans.partial).toBe(true);
    expect(ans.answer).toContain(
      "I cannot answer that: nothing in the site record covers it, and I will not guess.",
    );
    // The description prose names services; none may leak into the answer.
    for (const invented of ["Decks", "Fences", "Pergolas", "Bathrooms"]) {
      expect(ans.answer).not.toContain(invented);
    }
  });

  test("structured service objects -> cited, classified, sourced answer", () => {
    const target = businessObject();
    const svc = serviceObject("svc-deck", "Deck Building Services");
    const ctx = ctxFor(target, [svc], [providesRel("rel-1", target.id, svc.id)]);
    const ans = composeAskFyd(ctx, QUESTION);

    expect(ans.partial).toBe(false);
    expect(ans.answer).toContain("Deck Building Services");
    expect(ans.evidenceRefs.length).toBeGreaterThan(0);
    expect(ans.claimClassifications.length).toBeGreaterThan(0);
    for (const c of ans.claimClassifications) {
      expect(c.evidenceRefIds.length).toBeGreaterThan(0);
    }
    expect(ans.sourceUrls.length).toBeGreaterThan(0);
    expect(
      ans.sourceUrls.some((u) => u.includes("happy-place-platform.vercel.app")),
    ).toBe(true);
  });

  test("named service and derived count carry the renderer's shared verifier receipt", () => {
    const target = businessObject();
    const svc = serviceObject("svc-deck", "Deck Building Services");
    const ans = composeAskFyd(ctxFor(target, [svc], [providesRel("rel-1", target.id, svc.id)]), QUESTION);
    expect(ans.bindingVerification?.version).toBe("fyd-verified-render-model@1");
    expect(ans.bindingVerification?.atoms.map(a => a.value).sort()).toEqual([svc.title, target.title].sort());
    expect(ans.bindingVerification?.atoms.every(a => a.classification !== "UNKNOWN" && !!a.evidenceRef)).toBe(true);
    expect(ans.claimClassifications).toHaveLength(2);
    for (const claim of ans.claimClassifications) {
      expect(claim.bindings).toEqual(expect.arrayContaining([
        expect.objectContaining({ objectId: target.id, field: "title" }),
        expect.objectContaining({ objectId: svc.id, field: "title" }),
      ]));
      expect(claim.relationshipIds).toEqual(["rel-1"]);
      expect(claim.evidenceRefIds).toContain("rel-1");
    }
    expect(ans.answer).not.toContain("Evidence\n");
    expect(ans.answer).not.toContain("[SUPPORTED]");
    expect(ans.answer).not.toContain("[DERIVED]");
  });

  test.each(["stale", "missing"])("%s source evidence withholds the service name", mode => {
    const target = businessObject();
    const svc = serviceObject("svc-deck", "Unsupported Secret Service");
    svc.provenance = { ...svc.provenance!, ...(mode === "stale" ? { derivedAt: "2020-01-01T00:00:00Z" } : { ref: "" }) };
    const ans = composeAskFyd(ctxFor(target, [svc], [providesRel("rel-1", target.id, svc.id)]), QUESTION);
    expect(ans.partial).toBe(true);
    expect(ans.answer).not.toContain(svc.title);
    expect(ans.unknowns.join(" ")).toContain("unknown");
    expect(ans.claimClassifications).toHaveLength(0);
    expect(ans.bindingVerification?.atoms).toHaveLength(0);
  });

  test.each(["inverse", "unrelated", "inactive"])("%s relationship cannot assert that this business offers a service", mode => {
    const target = businessObject();
    const svc = serviceObject("svc-deck", "Unrelated Service");
    const rel = providesRel("rel-1", target.id, svc.id);
    if (mode === "inverse") { rel.subject = svc.id; rel.object = target.id; }
    if (mode === "unrelated") rel.subject = "another-business";
    if (mode === "inactive") rel.status = "inactive";
    const ans = composeAskFyd(ctxFor(target, [svc], [rel]), QUESTION);
    expect(ans.answer).not.toContain(svc.title);
    expect(ans.claimClassifications).toHaveLength(0);
  });

  function bundleWithService(visibility: PingObject["visibility"] = "public"): SiteBundle {
    const target = businessObject();
    const svc = { ...serviceObject("svc-deck", "Deck Building Services"), visibility };
    return {
      siteId: "demo-test", businessName: target.title,
      graph: { objects: [target, svc], relationships: [providesRel("rel-1", target.id, svc.id)] },
      spec: { ownerObjectId: target.id, pages: [] } as unknown as SiteBundle["spec"],
      findings: [], renderable: true, mediaManifest: null,
    };
  }

  test("visitor scope removes a private service before the shared verifier receives it", () => {
    const ans = answerAskFyd({ siteId: "demo-test", mode: "visitor", question: QUESTION }, { loadBundle: () => bundleWithService("private") });
    expect(ans.ok).toBe(true);
    if (!ans.ok) throw new Error("expected an honest refusal");
    expect(ans.refusal).toBe(true);
    expect(ans.answer).not.toContain("Deck Building Services");
    expect(ans.citations).toHaveLength(0);
    expect(ans.bindingVerification?.atoms).toHaveLength(0);
  });

  test("the output contract rejects an absent binding or a relationship not cited for that claim", () => {
    const outcome = answerAskFyd({ siteId: "demo-test", mode: "visitor", question: QUESTION }, { loadBundle: () => bundleWithService() });
    if (!outcome.ok) throw new Error("expected an answer");
    const claims = contractClaimsFor(outcome.claimClassifications);
    const args = { outcome, answerClass: "DERIVED" as const, answerState: "KNOWN" as const, claims };
    expect(() => assertAskAnswerContract(args)).not.toThrow();
    expect(() => assertAskAnswerContract({ ...args, outcome: { ...outcome, bindingVerification: { ...outcome.bindingVerification!, atoms: [] } } })).toThrow(/absent from shared verifier/);
    expect(() => assertAskAnswerContract({ ...args, claims: claims.map(c => ({ ...c, evidenceRefIds: c.evidenceRefIds.filter(id => id !== "rel-1") })) })).toThrow(/relationship is not served/);
    expect(() => assertAskAnswerContract({ ...args, claims: claims.map(c => ({ ...c, bindings: [] })) })).toThrow(/no factual bindings/);
  });
});
