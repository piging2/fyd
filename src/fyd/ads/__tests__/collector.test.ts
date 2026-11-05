/**
 * B4 collector tests: the framework-free collector core.
 *
 * - Impression drafts are minted ONLY by the rank contract's
 *   tracker: the emitted dedupeKey is exactly the tracker shape
 *   JSON.stringify(["fyd-object-impression", objectId, surface,
 *   renderInstanceId, placementId ?? null]).
 * - Sub-threshold visibility and a hidden document produce no
 *   draft; the dwell must be one continuous foreground second.
 * - At most one impression draft per render instance.
 * - Clicks: untrusted activations produce no draft; a trusted
 *   activation produces the contract's OBJECT_OPEN action draft
 *   carrying the sponsorship triple.
 */

import {
  createObjectImpressionTracker,
  type FydObjectEventDraft,
  type ObjectEventContext,
} from "../../rank/object-events";
import type { EligibleSponsoredPlacement } from "../../rank/sponsored-placement";
import { createAdsCollector } from "../collector";

const OBJECT_ID = "ping-fyd-business";
const SURFACE = "loop-demo";
const NOW = Date.UTC(2026, 10, 4, 19, 0, 0);

function placement(): EligibleSponsoredPlacement {
  return {
    objectId: OBJECT_ID,
    placementId: "placement-ping-house-001-loop-demo",
    campaignId: "ping-house-001",
    payerId: "ping-fyd",
    disclosure: "Sponsored",
    sponsorDisplayName: "PING",
    reason: "Shown because this page opted in to PING placements.",
    surface: SURFACE,
    evaluatedAt: NOW - 1000,
    validUntil: NOW + 60 * 60 * 1000,
  } as EligibleSponsoredPlacement;
}

function sponsoredContext(): ObjectEventContext {
  return {
    objectId: OBJECT_ID,
    surface: SURFACE,
    correlationId: "corr-1",
    renderInstanceId: "render-1",
    authorizedActor: { sessionId: "viewer-scope-1" },
    sponsorship: placement(),
  };
}

function harness(context: ObjectEventContext) {
  const drafts: FydObjectEventDraft[] = [];
  const collector = createAdsCollector({
    context,
    post: (draft) => {
      drafts.push(draft);
    },
  });
  return { collector, drafts };
}

const visible = (at: number) => ({
  at,
  rendered: true,
  visibleFraction: 1,
  documentVisible: true,
});

describe("impression rule", () => {
  it("emits exactly the tracker-minted draft after the dwell rule is met", () => {
    const { collector, drafts } = harness(sponsoredContext());
    collector.observe(visible(NOW));
    expect(drafts).toEqual([]);
    collector.observe(visible(NOW + 999));
    expect(drafts).toEqual([]);
    collector.observe(visible(NOW + 1000));
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft.type).toBe("FYD_SPONSORED_IMPRESSION");
    expect(draft.dedupeKey).toBe(
      JSON.stringify([
        "fyd-object-impression",
        OBJECT_ID,
        SURFACE,
        "render-1",
        "placement-ping-house-001-loop-demo",
      ]),
    );
    expect(draft.sponsorship).toEqual({
      placementId: "placement-ping-house-001-loop-demo",
      campaignId: "ping-house-001",
      payerId: "ping-fyd",
    });
    expect(draft.actor).toEqual({ sessionId: "viewer-scope-1" });
    // The key equals what the contract's tracker mints for the same
    // context and samples: the collector adds nothing of its own.
    const tracker = createObjectImpressionTracker(sponsoredContext());
    tracker.observe(visible(NOW));
    const direct = tracker.observe(visible(NOW + 1000));
    expect(draft.dedupeKey).toBe(direct?.dedupeKey);
  });

  it("emits at most one impression per render instance", () => {
    const { collector, drafts } = harness(sponsoredContext());
    collector.observe(visible(NOW));
    collector.observe(visible(NOW + 1000));
    collector.observe(visible(NOW + 2000));
    collector.observe(visible(NOW + 5000));
    expect(drafts).toHaveLength(1);
  });

  it("produces no draft for sub-threshold visibility", () => {
    const { collector, drafts } = harness(sponsoredContext());
    const partial = (at: number) => ({
      at,
      rendered: true,
      visibleFraction: 0.49,
      documentVisible: true,
    });
    collector.observe(partial(NOW));
    collector.observe(partial(NOW + 2000));
    collector.observe(partial(NOW + 10000));
    expect(drafts).toEqual([]);
  });

  it("requires one continuous foreground second: a hidden sample resets the dwell", () => {
    const { collector, drafts } = harness(sponsoredContext());
    collector.observe(visible(NOW));
    collector.observe({
      at: NOW + 500,
      rendered: true,
      visibleFraction: 1,
      documentVisible: false,
    });
    collector.observe(visible(NOW + 600));
    collector.observe(visible(NOW + 1599));
    expect(drafts).toEqual([]);
    collector.observe(visible(NOW + 1600));
    expect(drafts).toHaveLength(1);
  });

  it("mints the organic key shape (null placement) without sponsorship", () => {
    const context: ObjectEventContext = {
      objectId: "ping-fyd-svc-calls",
      surface: SURFACE,
      correlationId: "corr-2",
      renderInstanceId: "render-2",
    };
    const { collector, drafts } = harness(context);
    collector.observe(visible(NOW));
    collector.observe(visible(NOW + 1000));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].type).toBe("FYD_OBJECT_IMPRESSION");
    expect(drafts[0].dedupeKey).toBe(
      JSON.stringify([
        "fyd-object-impression",
        "ping-fyd-svc-calls",
        SURFACE,
        "render-2",
        null,
      ]),
    );
    expect(drafts[0].sponsorship).toBeUndefined();
  });
});

describe("click capture", () => {
  it("produces no draft for an untrusted activation", () => {
    const { collector, drafts } = harness(sponsoredContext());
    collector.click({
      isTrusted: false,
      kind: "pointer",
      at: NOW + 2000,
      interactionId: "ix-1",
    });
    expect(drafts).toEqual([]);
  });

  it("produces the contract OBJECT_OPEN action draft on a trusted activation", () => {
    const { collector, drafts } = harness(sponsoredContext());
    collector.click({
      isTrusted: true,
      kind: "pointer",
      at: NOW + 2000,
      interactionId: "ix-1",
    });
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft.type).toBe("FYD_OBJECT_OPENED");
    expect(draft.action).toBe("OBJECT_OPEN");
    expect(draft.sponsorship).toEqual({
      placementId: "placement-ping-house-001-loop-demo",
      campaignId: "ping-house-001",
      payerId: "ping-fyd",
    });
    expect(draft.dedupeKey).toBe(
      JSON.stringify([
        "fyd-object-action",
        OBJECT_ID,
        SURFACE,
        "render-1",
        "OBJECT_OPEN",
        "ix-1",
      ]),
    );
  });
});
