import { getSponsoredPresentation, type EligibleSponsoredPlacement } from "./sponsored-placement";

/** These are distinct user intents, not one generic click metric. */
export type FydObjectAction =
  | "OBJECT_OPEN" | "OBJECT_CLOSE" | "WEBSITE_OPEN" | "FOLLOW" | "UNFOLLOW"
  | "LIKE" | "UNLIKE" | "CALL" | "DIRECTIONS" | "MESSAGE" | "ASK_FYD" | "EVIDENCE_OPEN";

const ACTION_EVENTS = {
  OBJECT_OPEN: "FYD_OBJECT_OPENED",
  OBJECT_CLOSE: "FYD_OBJECT_CLOSED",
  WEBSITE_OPEN: "FYD_OBJECT_WEBSITE_OPENED",
  FOLLOW: "FYD_OBJECT_FOLLOW_REQUESTED",
  UNFOLLOW: "FYD_OBJECT_UNFOLLOW_REQUESTED",
  LIKE: "FYD_OBJECT_LIKE_REQUESTED",
  UNLIKE: "FYD_OBJECT_UNLIKE_REQUESTED",
  CALL: "FYD_OBJECT_CALL_REQUESTED",
  DIRECTIONS: "FYD_OBJECT_DIRECTIONS_OPENED",
  MESSAGE: "FYD_OBJECT_MESSAGE_REQUESTED",
  ASK_FYD: "FYD_OBJECT_ASK_STARTED",
  EVIDENCE_OPEN: "FYD_OBJECT_EVIDENCE_OPENED",
} as const;

export interface ObjectEventContext {
  objectId: string;
  surface: string;
  correlationId: string;
  /** Stable per rendered instance; supplied by the host, not minted by ranking. */
  renderInstanceId: string;
  /** Omit unless the existing identity/privacy boundary authorizes attribution. */
  authorizedActor?: { viewerId?: string; sessionId?: string };
  sponsorship?: EligibleSponsoredPlacement | null;
}

export interface FydObjectEventDraft {
  type: (typeof ACTION_EVENTS)[FydObjectAction] | "FYD_OBJECT_IMPRESSION" | "FYD_SPONSORED_IMPRESSION";
  objectId: string;
  surface: string;
  correlationId: string;
  renderInstanceId: string;
  occurredAt: number;
  actor?: ObjectEventContext["authorizedActor"];
  action?: FydObjectAction;
  sponsorship?: { placementId: string; campaignId: string; payerId: string };
  /** Retry identity proposal for the eventual Event Authority adapter. */
  dedupeKey: string;
}

const hasText = (value: string) => typeof value === "string" && value.trim().length > 0;
function validContext(context: ObjectEventContext): boolean {
  return [context.objectId, context.surface, context.correlationId, context.renderInstanceId].every(hasText);
}

/**
 * This adapter remains explicitly UNBOUND pending Event Authority convergence.
 * It writes no database, localStorage, journal, analytics endpoint, or console.
 * A future authority adapter must own durable IDs, dedupe, privacy and receipts.
 */
export interface FydObjectEventAdapter {
  authority: "unbound" | "canonical";
  publish(event: FydObjectEventDraft): Promise<{ status: "unbound" } | { status: "recorded"; receiptRef: string }>;
}
export const UNBOUND_OBJECT_EVENT_ADAPTER: FydObjectEventAdapter = Object.freeze({
  authority: "unbound" as const,
  async publish(_event: FydObjectEventDraft) { return { status: "unbound" as const }; },
});

function baseEvent(context: ObjectEventContext, at: number) {
  const sponsored = getSponsoredPresentation(context.sponsorship, { objectId: context.objectId, surface: context.surface, now: at });
  return {
    objectId: context.objectId,
    surface: context.surface,
    correlationId: context.correlationId,
    renderInstanceId: context.renderInstanceId,
    occurredAt: at,
    ...(context.authorizedActor ? { actor: { ...context.authorizedActor } } : {}),
    ...(sponsored ? { sponsorship: { placementId: sponsored.placementId, campaignId: sponsored.campaignId, payerId: sponsored.payerId } } : {}),
  };
}

/** Call only from a real native user activation; never from render/effects. */
export function createObjectActionEvent(
  action: FydObjectAction,
  context: ObjectEventContext,
  activation: { isTrusted: boolean; kind: "pointer" | "keyboard"; at: number; interactionId: string },
): FydObjectEventDraft | null {
  if (!validContext(context) || !activation.isTrusted || !["pointer", "keyboard"].includes(activation.kind)
    || !Number.isFinite(activation.at) || !hasText(activation.interactionId) || !Object.prototype.hasOwnProperty.call(ACTION_EVENTS, action)) return null;
  if (context.sponsorship && !getSponsoredPresentation(context.sponsorship, {
    objectId: context.objectId, surface: context.surface, now: activation.at,
  })) return null;
  if (context.sponsorship && !getSponsoredPresentation(context.sponsorship, { objectId: context.objectId, surface: context.surface, now: activation.at })) return null;
  return {
    ...baseEvent(context, activation.at),
    type: ACTION_EVENTS[action],
    action,
    // Action intent is not a claim that a relationship write/call/message succeeded.
    dedupeKey: JSON.stringify(["fyd-object-action", context.objectId, context.surface, context.renderInstanceId, action, activation.interactionId]),
  };
}

export interface VisibilityObservation {
  at: number;
  rendered: boolean;
  visibleFraction: number;
  documentVisible: boolean;
}
export interface ImpressionThreshold { minimumVisibleFraction: number; minimumDwellMs: number }
export const OBJECT_IMPRESSION_THRESHOLD: Readonly<ImpressionThreshold> = Object.freeze({ minimumVisibleFraction: 0.5, minimumDwellMs: 1000 });

/**
 * Conservative definition: rendered + >=50% visible + foreground document for
 * one continuous second. Candidate generation/preloading cannot call this an
 * impression. The host must feed IntersectionObserver AND visibility changes,
 * and recheck after a dwell timer. No host collector is bound in this unit.
 * At most one event draft per rendered instance; never sums separate visits.
 */
export function createObjectImpressionTracker(
  context: ObjectEventContext,
  threshold: ImpressionThreshold = OBJECT_IMPRESSION_THRESHOLD,
): { observe(sample: VisibilityObservation): FydObjectEventDraft | null } {
  let visibleSince: number | null = null;
  let lastSampleAt: number | null = null;
  let emitted = false;
  const validThreshold = Number.isFinite(threshold.minimumVisibleFraction)
    && threshold.minimumVisibleFraction > 0 && threshold.minimumVisibleFraction <= 1
    && Number.isFinite(threshold.minimumDwellMs) && threshold.minimumDwellMs >= 1000;
  return {
    observe(sample) {
      if (emitted || !validThreshold || !validContext(context)) return null;
      if (!Number.isFinite(sample.at) || (lastSampleAt !== null && sample.at < lastSampleAt)) {
        visibleSince = null;
        return null;
      }
      lastSampleAt = sample.at;
      const visible = sample.rendered && sample.documentVisible && Number.isFinite(sample.visibleFraction)
        && sample.visibleFraction >= threshold.minimumVisibleFraction && sample.visibleFraction <= 1;
      if (!visible) { visibleSince = null; return null; }
      if (visibleSince === null) visibleSince = sample.at;
      if (sample.at - visibleSince < threshold.minimumDwellMs) return null;
      // Paid context must remain eligible throughout the observed interval.
      if (context.sponsorship && (!getSponsoredPresentation(context.sponsorship, { objectId: context.objectId, surface: context.surface, now: visibleSince })
        || !getSponsoredPresentation(context.sponsorship, { objectId: context.objectId, surface: context.surface, now: sample.at }))) return null;
      emitted = true;
      const event = baseEvent(context, sample.at);
      return {
        ...event,
        type: event.sponsorship ? "FYD_SPONSORED_IMPRESSION" : "FYD_OBJECT_IMPRESSION",
        dedupeKey: JSON.stringify(["fyd-object-impression", context.objectId, context.surface, context.renderInstanceId, event.sponsorship?.placementId ?? null]),
      };
    },
  };
}
