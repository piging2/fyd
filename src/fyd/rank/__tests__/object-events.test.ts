import { createObjectActionEvent, createObjectImpressionTracker, UNBOUND_OBJECT_EVENT_ADAPTER, type ObjectEventContext } from "../object-events";
import type { EligibleSponsoredPlacement } from "../sponsored-placement";

const context: ObjectEventContext = { objectId: "business", surface: "discovery", correlationId: "test-correlation", renderInstanceId: "test-render" };
const visible = { rendered: true, visibleFraction: 0.5, documentVisible: true };

describe("object event boundary", () => {
  test("candidate existence and offscreen DOM do not count as impressions", () => {
    const tracker = createObjectImpressionTracker(context);
    expect(tracker.observe({ ...visible, at: 0, rendered: false })).toBeNull();
    expect(tracker.observe({ ...visible, at: 2000, visibleFraction: 0 })).toBeNull();
    expect(tracker.observe({ ...visible, at: 4000, documentVisible: false })).toBeNull();
    expect(tracker.observe({ ...visible, at: 5000 })).toBeNull();
    expect(tracker.observe({ ...visible, at: 5999 })).toBeNull();
    expect(tracker.observe({ ...visible, at: 6000 })).toMatchObject({ type: "FYD_OBJECT_IMPRESSION", objectId: "business", occurredAt: 6000 });
    expect(tracker.observe({ ...visible, at: 8000 })).toBeNull();
  });

  test("separate short visible periods never accumulate to one impression", () => {
    const tracker = createObjectImpressionTracker(context);
    tracker.observe({ ...visible, at: 0 });
    tracker.observe({ ...visible, at: 600, visibleFraction: 0.49 });
    tracker.observe({ ...visible, at: 1000 });
    expect(tracker.observe({ ...visible, at: 1600 })).toBeNull();
    expect(tracker.observe({ ...visible, at: 2000 })).not.toBeNull();
  });

  test("invalid clocks and measurements fail closed", () => {
    const tracker = createObjectImpressionTracker(context);
    tracker.observe({ ...visible, at: 100 });
    expect(tracker.observe({ ...visible, at: 99 })).toBeNull();
    expect(tracker.observe({ ...visible, at: 1000, visibleFraction: NaN })).toBeNull();
    expect(createObjectImpressionTracker(context, { minimumVisibleFraction: 0, minimumDwellMs: 0 }).observe({ ...visible, at: 1000 })).toBeNull();
  });

  test("untrusted programmatic actions never become click events", () => {
    expect(createObjectActionEvent("OBJECT_OPEN", context, { isTrusted: false, kind: "pointer", at: 1000, interactionId: "1" })).toBeNull();
  });

  test("expired paid context never becomes an organic click record", () => {
    const sponsorship = { objectId: "business", surface: "discovery", placementId: "test", campaignId: "test-campaign",
      payerId: "test-payer", sponsorDisplayName: "Sponsor", disclosure: "Sponsored", reason: "Fixture",
      evaluatedAt: 0, validUntil: 500 } as EligibleSponsoredPlacement;
    expect(createObjectActionEvent("WEBSITE_OPEN", { ...context, sponsorship }, {
      isTrusted: true, kind: "pointer", at: 1000, interactionId: "click-1",
    })).toBeNull();
  });

  test.each([
    ["OBJECT_OPEN", "FYD_OBJECT_OPENED"], ["WEBSITE_OPEN", "FYD_OBJECT_WEBSITE_OPENED"],
    ["FOLLOW", "FYD_OBJECT_FOLLOW_REQUESTED"], ["LIKE", "FYD_OBJECT_LIKE_REQUESTED"],
    ["CALL", "FYD_OBJECT_CALL_REQUESTED"], ["DIRECTIONS", "FYD_OBJECT_DIRECTIONS_OPENED"],
    ["MESSAGE", "FYD_OBJECT_MESSAGE_REQUESTED"], ["ASK_FYD", "FYD_OBJECT_ASK_STARTED"],
    ["EVIDENCE_OPEN", "FYD_OBJECT_EVIDENCE_OPENED"],
  ] as const)("%s keeps its action meaning", (action, type) => {
    const event = createObjectActionEvent(action, context, { isTrusted: true, kind: "keyboard", at: 1000, interactionId: "1" });
    expect(event).toMatchObject({ type, action, objectId: context.objectId, surface: context.surface, correlationId: context.correlationId });
    expect(event).not.toHaveProperty("actor");
    expect(event).not.toHaveProperty("sponsorship");
  });

  test("adapter is explicitly unbound and reports no persistence success", async () => {
    const event = createObjectActionEvent("FOLLOW", context, { isTrusted: true, kind: "pointer", at: 1000, interactionId: "1" })!;
    expect(UNBOUND_OBJECT_EVENT_ADAPTER.authority).toBe("unbound");
    expect(await UNBOUND_OBJECT_EVENT_ADAPTER.publish(event)).toEqual({ status: "unbound" });
  });
});
