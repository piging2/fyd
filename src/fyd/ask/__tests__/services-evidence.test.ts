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
});
