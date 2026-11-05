/**
 * Event collector core for the FYD objects economic loop (lane B4;
 * DESIGN.md component D, client side). Framework-free: the React
 * wrapper lives in collector-client.tsx and feeds this core the
 * host observations the rank contract requires (IntersectionObserver
 * samples plus document visibility).
 *
 * Two contract laws are enforced here by construction:
 *
 *   - Impression dedupeKeys are minted ONLY by the rank contract's
 *     createObjectImpressionTracker. The ledger classifies any
 *     impression whose key is not exactly the tracker-minted shape
 *     as INVALID (impression-evidence-missing; B2 decision 1), so
 *     this module never builds a key itself: it feeds visibility
 *     samples into the tracker and posts whatever draft the tracker
 *     emits (at most one per render instance, after the 50 percent /
 *     1-second-foreground rule is met).
 *   - Click drafts come only from the contract's
 *     createObjectActionEvent on a real native activation. An
 *     untrusted or synthetic activation yields no draft, and render
 *     or effect code never calls it.
 *
 * Posting is best-effort by design: a failed POST never throws into
 * the host page.
 */

import {
  createObjectActionEvent,
  createObjectImpressionTracker,
  type FydObjectEventDraft,
  type ImpressionThreshold,
  type ObjectEventContext,
  type VisibilityObservation,
} from "../rank/object-events";

/** The loop events route (DESIGN.md component E). */
export const ADS_EVENTS_ENDPOINT = "/api/fyd/ads/events" as const;

/** Posts one draft. Implementations must not throw synchronously. */
export type AdsDraftPost = (draft: FydObjectEventDraft) => void;

/**
 * The default poster: a fire-and-forget fetch POST of the draft as
 * JSON. keepalive lets a click draft survive the navigation it
 * causes. Every failure is swallowed: event delivery can never
 * break the publisher page.
 */
export function createFetchAdsDraftPost(
  endpoint: string = ADS_EVENTS_ENDPOINT,
): AdsDraftPost {
  return (draft) => {
    if (typeof fetch !== "function") return;
    try {
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
        keepalive: true,
      }).catch(() => {
        // Delivery is best-effort; the ledger is the authority and
        // a lost draft is simply an event that never happened.
      });
    } catch {
      // Same law: never throw into the host.
    }
  };
}

export interface AdsCollectorOptions {
  /** The rendered placement's event context (from the render seam). */
  context: ObjectEventContext;
  /** Poster override (tests); default the fetch poster. */
  post?: AdsDraftPost;
  /** Endpoint for the default poster; default ADS_EVENTS_ENDPOINT. */
  endpoint?: string;
  /** Threshold override; default the contract's OBJECT_IMPRESSION_THRESHOLD. */
  threshold?: ImpressionThreshold;
}

export interface AdsCollectorClickActivation {
  /** From the native event; synthetic activations produce no draft. */
  isTrusted: boolean;
  kind: "pointer" | "keyboard";
  /** Epoch ms (Date.now at activation time; see collector-client). */
  at: number;
  interactionId: string;
}

export interface AdsCollector {
  /** Feed one host visibility observation into the tracker. */
  observe(sample: VisibilityObservation): void;
  /** Report a real user activation on the placement (click capture). */
  click(activation: AdsCollectorClickActivation): void;
}

export function createAdsCollector(options: AdsCollectorOptions): AdsCollector {
  const post = options.post ?? createFetchAdsDraftPost(options.endpoint);
  const tracker = createObjectImpressionTracker(
    options.context,
    options.threshold,
  );
  const send = (draft: FydObjectEventDraft | null): void => {
    if (!draft) return;
    try {
      post(draft);
    } catch {
      // A poster defect must not break the host page either.
    }
  };
  return {
    observe(sample) {
      send(tracker.observe(sample));
    },
    click(activation) {
      // OBJECT_OPEN is the click-path action for a placement card:
      // activating the card opens the object. The builder refuses
      // untrusted activations and expired sponsorships itself.
      send(
        createObjectActionEvent("OBJECT_OPEN", options.context, {
          isTrusted: activation.isTrusted,
          kind: activation.kind,
          at: activation.at,
          interactionId: activation.interactionId,
        }),
      );
    },
  };
}
