import * as React from "react";
import type { RankReason } from "@/fyd/rank/object-ranker";
import { getSponsoredPresentation, type EligibleSponsoredPlacement } from "@/fyd/rank/sponsored-placement";

/** A per-placement projection. Never persist it on the business object. */
export interface ObjectDisplayContext {
  surface: string;
  /** Explicit host selection; never described as a personalized ranking signal. */
  selectionReason?: string;
  rankReasons?: readonly RankReason[];
  sponsorship?: EligibleSponsoredPlacement | null;
}

/** A paid context that expires must not silently become an unlabeled placement. */
export function isObjectDisplayContextValid(objectId: string, context?: ObjectDisplayContext, now = Date.now()): boolean {
  return !context?.sponsorship || getSponsoredPresentation(context.sponsorship, { objectId, surface: context.surface, now }) !== null;
}

export function ObjectPlacementDisclosure({ objectId, context, compact = false, now = Date.now() }: {
  objectId: string;
  context?: ObjectDisplayContext;
  compact?: boolean;
  now?: number;
}) {
  if (!context?.sponsorship || !isObjectDisplayContextValid(objectId, context, now)) return null;
  const paid = context.sponsorship;
  return <span data-fyd-sponsored={paid.placementId}
    aria-label={`Sponsored by ${paid.sponsorDisplayName}`}
    className="inline-flex max-w-full items-center rounded px-1.5 py-1 text-[11px] font-semibold leading-tight"
    style={{ color: "#fff7db", background: "#332b19" }}>
    {compact ? "Sponsored" : `Sponsored · ${paid.sponsorDisplayName}`}
  </span>;
}

export function ObjectDiscoveryExplanation({ objectId, context, now = Date.now() }: {
  objectId: string;
  context?: ObjectDisplayContext;
  now?: number;
}) {
  if (!context || !isObjectDisplayContextValid(objectId, context, now)) return null;
  const reasons = context.rankReasons ?? [];
  if (!reasons.length && !context.sponsorship && !context.selectionReason) return null;
  return <details className="mt-2 text-xs leading-relaxed" data-fyd-rank-explanation>
    <summary className="cursor-pointer py-2 underline decoration-current/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-honey">Why am I seeing this?</summary>
    <ul className="list-disc space-y-1 pb-2 pl-4">
      {context.selectionReason && <li>{context.selectionReason}</li>}
      {context.sponsorship && <li>Sponsored by {context.sponsorship.sponsorDisplayName}. {context.sponsorship.reason}</li>}
      {reasons.map((reason) => <li key={reason.code}>{reason.text}</li>)}
    </ul>
  </details>;
}
