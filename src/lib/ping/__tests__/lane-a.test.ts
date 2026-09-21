/**
 * Lane A focused tests: action planner rules, deterministic feed ranking,
 * evidence-backed answer composition, proposal digest tamper detection,
 * website-derived provenance, and unknown-schema handling.
 */

import { planActions } from "../action-planner";
import { kindWeight, rankDiscoveryItems, recencyScore } from "../feed-rank";
import { RankableItem } from "../feed-rank";
import {
  buildAskContext,
  composeAnswer,
  proposalDigest,
  verifyProposalDigest,
} from "../ask-composer";
import { ProposalBody } from "../ask-composer";
import { getWebsiteObjects, WEBSITE_BUSINESS_ID } from "../website-objects";
import { AskProposal, PingObject } from "../types";

function makeObject(over: Partial<PingObject> = {}): PingObject {
  return {
    id: "obj:1",
    schema: "ping.social.post@1",
    controllerId: "id:alice",
    visibility: "public",
    title: "Test object",
    description: "A test object.",
    fields: {},
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    provenance: { kind: "canonical-journal", ref: "evt:1" },
    ...over,
  };
}

const NOW = "2026-09-20T12:00:00.000Z";

describe("action planner", () => {
  test("follow applies to identity-backed targets, never self", () => {
    const business = makeObject({ schema: "ping.social.business@1", id: "obj:biz" });
    const other = planActions({
      viewerId: "id:bob",
      target: business,
      targetIdentityId: "id:alice",
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(other.actions.map((a) => a.kind)).toContain("follow");

    const self = planActions({
      viewerId: "id:alice",
      target: business,
      targetIdentityId: "id:alice",
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(self.actions.map((a) => a.kind)).not.toContain("follow");
  });

  test("like belongs on objects, not identities", () => {
    const post = makeObject({ schema: "ping.social.post@1", id: "obj:post" });
    const likePlan = planActions({
      viewerId: "id:bob",
      target: post,
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    const kinds = likePlan.actions.map((a) => a.kind);
    expect(kinds).toContain("like");
    expect(kinds).not.toContain("follow");

    const business = makeObject({ schema: "ping.social.business@1", id: "obj:biz" });
    const noLike = planActions({
      viewerId: "id:bob",
      target: business,
      targetIdentityId: "id:alice",
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(noLike.actions.map((a) => a.kind)).not.toContain("like");
  });

  test("propose_update only when the viewer controls the object", () => {
    const mine = makeObject({ controllerId: "id:bob" });
    const p1 = planActions({
      viewerId: "id:bob",
      target: mine,
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(p1.actions.map((a) => a.kind)).toContain("propose_update");

    const p2 = planActions({
      viewerId: "id:carol",
      target: mine,
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(p2.actions.map((a) => a.kind)).not.toContain("propose_update");
  });

  test("open_website only when a public URL exists", () => {
    const withSite = planActions({
      viewerId: null,
      target: makeObject({ fields: { website: "https://example.com" } }),
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: "https://example.com",
    });
    expect(withSite.actions.map((a) => a.kind)).toContain("open_website");

    const withoutSite = planActions({
      viewerId: null,
      target: makeObject(),
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    expect(withoutSite.actions.map((a) => a.kind)).not.toContain("open_website");
  });

  test("open, ask, reference always available for known objects", () => {
    const plan = planActions({
      viewerId: null,
      target: makeObject({ schema: "ping.social.service@1" }),
      targetIdentityId: null,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
    });
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["open", "ask", "reference"]));
  });
});

describe("feed ranking", () => {
  function item(over: Partial<RankableItem> = {}): RankableItem {
    return {
      id: "item:1",
      kind: "object_activity",
      eventTime: "2026-09-20T11:00:00.000Z",
      actorProximity: 0,
      ...over,
    };
  }

  test("deterministic: same inputs produce the same order", () => {
    const items = [
      item({ id: "a", kind: "website_content", eventTime: "2026-09-20T11:55:00.000Z" }),
      item({ id: "b", kind: "object_activity", eventTime: "2026-09-20T11:00:00.000Z" }),
      item({ id: "c", kind: "new_public_object", eventTime: "2026-09-20T10:00:00.000Z" }),
    ];
    const once = rankDiscoveryItems(items, NOW).map((i) => i.id);
    const twice = rankDiscoveryItems(items, NOW).map((i) => i.id);
    expect(once).toEqual(twice);
    expect(once[0]).toBe("b");
  });

  test("recency decays and floors at zero", () => {
    expect(recencyScore("2026-09-20T11:00:00.000Z", NOW)).toBeGreaterThan(
      recencyScore("2026-09-19T11:00:00.000Z", NOW),
    );
    expect(recencyScore("2026-08-01T00:00:00.000Z", NOW)).toBe(0);
  });

  test("tie breaks by event time then id", () => {
    const items = [
      item({ id: "z", kind: "website_content", eventTime: "2026-09-20T11:00:00.000Z" }),
      item({ id: "a", kind: "website_content", eventTime: "2026-09-20T11:00:00.000Z" }),
      item({ id: "m", kind: "website_content", eventTime: "2026-09-20T11:30:00.000Z" }),
    ];
    const ranked = rankDiscoveryItems(items, NOW).map((i) => i.id);
    expect(ranked).toEqual(["m", "a", "z"]);
  });

  test("kind weights order object activity above website content", () => {
    expect(kindWeight("object_activity")).toBeGreaterThan(kindWeight("website_content"));
  });
});

describe("ask composer", () => {
  test("answers are evidence-backed and cite evidence", () => {
    const target = makeObject({ title: "PING Social", schema: "ping.social.business@1" });
    const ctx = buildAskContext({
      viewer: { id: "id:bob", displayName: "Bob" },
      target,
      relatedObjects: [],
      relationships: [],
      plan: null,
    });
    const answer = composeAnswer(ctx, "What is this?");
    expect(answer.evidenceRefs.length).toBeGreaterThan(0);
    expect(answer.answer).toMatch(/\[\d+\]/);
    expect(answer.partial).toBe(false);
  });

  test("partial answers stay honest when evidence is absent", () => {
    const ctx = buildAskContext({
      viewer: { id: null, displayName: null },
      target: null,
      relatedObjects: [],
      relationships: [],
      plan: null,
    });
    const answer = composeAnswer(ctx, "Summarize the quarterly revenue outlook");
    expect(answer.partial).toBe(true);
    expect(answer.answer.length).toBeGreaterThan(0);
  });

  test("proposal digest tampering is detected", () => {
    const body: ProposalBody = {
      kind: "object_update",
      targetObjectId: "obj:1",
      schema: "ping.social.post@1",
      changes: { title: "New title" },
    };
    const proposal: AskProposal = {
      kind: body.kind,
      targetObjectId: body.targetObjectId,
      schema: body.schema,
      changes: body.changes,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256",
      note: "draft",
    };
    expect(verifyProposalDigest(proposal)).toBe(true);

    const tampered: AskProposal = {
      ...proposal,
      changes: { title: "Evil title" },
    };
    expect(verifyProposalDigest(tampered)).toBe(false);
  });
});

describe("website-derived objects", () => {
  test("every website object carries website-derived provenance", () => {
    const objects = getWebsiteObjects();
    expect(objects.length).toBeGreaterThan(0);
    for (const o of objects) {
      expect(o.provenance.kind).toBe("website-derived");
      expect(o.provenance.ref).toBeTruthy();
    }
  });

  test("tenant business object uses the stable web: id", () => {
    const objects = getWebsiteObjects();
    const biz = objects.find((o) => o.id === WEBSITE_BUSINESS_ID);
    expect(biz).toBeDefined();
    expect(biz?.schema).toBe("ping.social.business@1");
  });
});
