/**
 * Lane D: customize-with-FYD intent pipeline — shared types.
 *
 * Layer law (frozen): customization operates on INTENT and structured
 * state. Three layers stay separate:
 *
 *   FACTS              the object graph (objects, relationships). Source
 *                      truth; every claim carries provenance. The intent
 *                      pipeline never writes here.
 *   PRESENTATION INTENT  owner-approved display directives (section order,
 *                      object order, presentation fields). Persisted as
 *                      PresentationIntentDirective records, each carrying
 *                      its approval evidence. Applied OVER the compiled
 *                      spec at render time; never merged into facts.
 *   DESIGN SYSTEM        theme tokens, component registry, renderer
 *                      semantics. Not customizable through this pipeline;
 *                      directives that touch it are refused, not coerced.
 *
 * No direct DOM editing, no generated-JSX mutation, no arbitrary CSS
 * injection anywhere in this lane.
 */

import type { SiteIntent, SitePatchBody } from "../proceduralize/patch";

/**
 * The typed, deterministic intent object. Plain English goes in, one of
 * these comes out. This is data, never free-form text passed to a
 * renderer. Same normalized text always yields the same object.
 */
export type ParsedIntent =
  | { kind: "promote_first"; target: string }
  | { kind: "feature_object"; target: string }
  | { kind: "hide_section"; target: string }
  | { kind: "show_section"; target: string }
  | { kind: "hide_object"; target: string };

/**
 * Honest failure: the text is not a supported customization. The reason
 * names what IS supported. Never silently reinterpreted into something
 * the owner did not ask for.
 */
export interface UnsupportedIntent {
  unsupported: true;
  reason: string;
  normalizedText: string;
}

export type ParseResult =
  | { intent: ParsedIntent; intentDigest: string }
  | UnsupportedIntent;

export function isUnsupported(r: ParseResult): r is UnsupportedIntent {
  return "unsupported" in r && (r as UnsupportedIntent).unsupported === true;
}

/** A parsed intent grounded against the site's actual evidence. */
export interface ResolvedIntent {
  resolved: true;
  parsed: ParsedIntent;
  /** The structured editor intent (proceduralize/patch.ts) this resolves to. */
  siteIntent: SiteIntent;
  resolutionNote: string;
}

/** A parsed intent that names nothing in this site's evidence. */
export interface UnresolvedIntent {
  resolved: false;
  parsed: ParsedIntent;
  reason: string;
}

export type ResolveResult = ResolvedIntent | UnresolvedIntent;

/**
 * One persisted owner presentation-intent directive. This is
 * PRESENTATION INTENT evidence, distinguishable from FACTS: it lives in
 * the projection's presentationIntent block (never in the object graph),
 * and it carries its full approval lineage.
 */
export interface PresentationIntentDirective {
  /** Deterministic id: "pi-" + sha256(siteId + proposalDigest).slice(0, 16). */
  intentId: string;
  /** The resolved structured intent that was approved. */
  siteIntent: SiteIntent;
  /** The exact digest-bound proposal the owner approved. */
  proposal: SitePatchBody;
  approval: {
    proposalDigest: string;
    /** Demo only: "demo-owner (seeded, unverified)". Never a real identity. */
    approvedBy: string;
    approvedAt: string;
    /** "DEMO OWNER MODE - not real authentication" marker. */
    note: string;
    /** Filled by the projection dump from the journal event. */
    eventId?: string;
  };
}

/** The presentation-intent block of a site projection. */
export interface PresentationIntentBlock {
  directives: PresentationIntentDirective[];
  provenance: {
    kind: "owner-presentation-intent";
    note: string;
    eventIds: string[];
  };
}

/** Overlay op kinds the projection dump understands (see dump.py). */
export type PresentationIntentOverlayOp =
  | {
      op: "set_presentation_intent";
      intentId: string;
      siteIntent: SiteIntent;
      proposal: SitePatchBody;
      approval: {
        proposalDigest: string;
        approvedBy: string;
        approvedAt: string;
        note: string;
      };
    }
  | { op: "clear_presentation_intent"; intentId: string };

/**
 * The set-variant of the overlay op: the exact approved directive the owner
 * reviewed (proposal digest, approval lineage). buildDirective (./server.ts)
 * always produces this variant.
 */
export type SetPresentationIntentOp = Extract<
  PresentationIntentOverlayOp,
  { op: "set_presentation_intent" }
>;
