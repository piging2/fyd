/**
 * LANE-8: the render-side viewer projection seam.
 *
 * One seam answers "same state, different authorized projections" for the
 * page shells: projectForViewer(state, viewerKind) -> ProjectedSiteView.
 * The page shells for /sites/* and /build/[siteId] consume ONLY the
 * projected view. No component imports raw state.
 *
 * Semantics mirror the model side (src/fyd/ask/context-projection.ts,
 * FYD-010 owns that file; this module only mirrors its contract):
 *
 * 1. classifyRenderViewer answers WHO, fail closed. "owner" requires a
 *    verified identity (verified === true AND a non-empty id). "engineer"
 *    requires an explicit engineer grant, never a query param or mode
 *    string alone. Everything else, anonymous, unknown, demo, practice,
 *    unverified id, is "visitor". Demo-owner constructs can NEVER produce
 *    the owner class: they are not verification.
 * 2. projectForViewer answers WHAT each viewer class may see. One
 *    deterministic pipeline for every viewer class. The projection does
 *    NOT widen the graph for the owner class: owner-only data belongs on
 *    owner surfaces, and the privacy boundary (verifyPublicProjection,
 *    always "anonymous" for these pages) already ran upstream.
 *
 * Pure, deterministic, no I/O. Never mutates its inputs. Browser-safe.
 */

import type { PingObject } from "@/lib/ping/types";
import { supportForClaim } from "../object/why-this-steps";
import type { DisplayMedia } from "../media/select";
import type {
  FYDFinding,
  FYDSiteSpec,
  ObjectGraph,
} from "./types";

/**
 * Render viewer classes. "visitor" and "owner" mirror the ask-side
 * AskViewerClass naming; "engineer" is the deliberate debug surface.
 */
export type RenderViewerKind = "visitor" | "owner" | "engineer";

/**
 * The viewer claim the server resolves once per request (see
 * ./render-viewer-server.ts). Plain data: the classifier below is the only
 * thing that turns a claim into a class.
 */
export interface RenderViewerClaim {
  /** Stable id for the identity, when one resolved. */
  identityId?: string | null;
  /** True ONLY when a real verification step ran (never the demo). */
  verified?: boolean;
  /**
   * True ONLY when the server-side engineer grant is present (server env
   * grant AND the deliberate URL toggle). A query param alone can never
   * set this: the claim is built server-side.
   */
  engineerGrant?: boolean;
}

/**
 * Classify a render viewer. "engineer" if and only if the server resolved
 * an explicit engineer grant. "owner" if and only if the viewer carries a
 * verified identity: verified === true AND a non-empty id. Every other
 * shape, null, undefined, anonymous, unknown id, demo, practice, falls
 * through to "visitor". There is no elevation path that does not go
 * through verification (owner) or the explicit server grant (engineer).
 * Fail closed.
 */
export function classifyRenderViewer(
  claim: RenderViewerClaim | null | undefined,
): RenderViewerKind {
  if (claim?.engineerGrant === true) {
    return "engineer";
  }
  if (
    claim?.verified === true &&
    typeof claim.identityId === "string" &&
    claim.identityId.length > 0
  ) {
    return "owner";
  }
  return "visitor";
}

/** The fail-closed default for components that did not receive a kind. */
export const DEFAULT_RENDER_VIEWER_KIND: RenderViewerKind = "visitor";

/**
 * Normalize an optional viewer kind. Components consult the projected
 * view's kind; when none was provided they take the visitor projection.
 */
export function viewerKindOf(
  viewerKind: RenderViewerKind | undefined,
): RenderViewerKind {
  return viewerKind ?? DEFAULT_RENDER_VIEWER_KIND;
}

/** The compiled page artifacts projectForViewer consumes. */
export interface ProjectForViewerInput {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  findings: FYDFinding[];
  renderable: boolean;
  siteId?: string;
  heroMedia?: DisplayMedia | null;
  galleryMedia?: DisplayMedia[] | null;
  objectMedia?: Record<string, DisplayMedia[]>;
}

/**
 * The quiet page-level Source affordance (footer). Customer language only:
 * no ingestion vocabulary, no acceptance sequences, no digests.
 */
export interface PageSourceLine {
  /** e.g. "The business website". */
  sourceLabel: string;
  /** e.g. "September 2026". */
  observedLabel: string;
  /** The honest standing note about verification. */
  honestyNote: string;
}

/**
 * The single projected view the page shells consume. Branded so a raw
 * compiled-artifact bag cannot be passed where a projected view is
 * required.
 */
export interface ProjectedSiteView {
  readonly __projectedSiteView: "ProjectedSiteView";
  viewerKind: RenderViewerKind;
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  /**
   * Validator findings: the full list for engineer, [] for visitor/owner.
   * The invalid-spec branch renders a generic message for non-engineers;
   * only engineers see paths and severities.
   */
  findings: FYDFinding[];
  renderable: boolean;
  siteId?: string;
  heroMedia: DisplayMedia | null;
  galleryMedia: DisplayMedia[] | null;
  objectMedia?: Record<string, DisplayMedia[]>;
  /** Quiet Source affordance data. Rendered for every viewer class. */
  source: PageSourceLine;
  /**
   * The ONE owner affordance ("Customize with FYD"): owner and engineer
   * only. Lane 9 builds the conversational UX behind it; lane 8 reserves
   * the seam and the entry point.
   */
  showOwnerEntry: boolean;
  /**
   * The owner console model slot. Reserved for lane 9; the entry point
   * renders the existing conversational owner panel until then.
   */
  ownerConsole: { entryLabel: "Customize with FYD" } | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * "September 2026" from an ISO date string. Regex-parsed (no Date, no
 * locale, no timezone): deterministic across runtimes. Fail closed to
 * "date unknown" rather than printing a wrong or partial date.
 */
export function observedMonthYear(iso: string | undefined): string {
  const m = typeof iso === "string" ? iso.match(/^(\d{4})-(\d{2})/) : null;
  if (!m) return "date unknown";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "date unknown";
  return `${month} ${m[1]}`;
}

function claimKindOf(o: PingObject): string {
  const fields = (o as { fields?: unknown }).fields;
  if (typeof fields !== "object" || fields === null) return "";
  const claimKind = (fields as Record<string, unknown>)["claimKind"];
  return typeof claimKind === "string" ? claimKind : "";
}

/**
 * Customer-language source label for one object. Fixed mapping, no
 * per-customer branches: overlay-authored content is demo content, feed
 * items come from the business feed, canonical-journal facts are recorded
 * business information, everything else is the business website. Never
 * invents a source; the default is the page-level provenance truth
 * (website-ingestion).
 */
export function sourceLabelFor(o: PingObject): string {
  if (o.provenance?.kind === "overlay-authored") return "This demonstration";
  const claimKind = claimKindOf(o);
  if (claimKind === "feed_item") return "The business's feed";
  if (o.provenance?.kind === "canonical-journal")
    return "Business information on file";
  return "The business website";
}

/**
 * Customer-language direct/derived status line for one object. Reuses the
 * evidence taxonomy's SUPPORT classifier (supportForClaim) as the single
 * authority; this module only renders it in visitor-facing words.
 */
export function supportLineFor(o: PingObject): string {
  const support = supportForClaim(o);
  if (support === "OWNER-CONFIRMED") return "Confirmed by the business owner.";
  if (support === "DERIVED")
    return "Derived by FYD from business records. Not directly observed.";
  if (o.provenance?.kind === "overlay-authored")
    return "Added for this demonstration. Not the business's own words.";
  const claimKind = claimKindOf(o);
  if (claimKind === "feed_item") return "Observed in the business's feed.";
  if (claimKind === "website_statement")
    return "The business's own words. Not independently verified.";
  return "Business information. Not independently verified.";
}

function pageSourceLine(spec: FYDSiteSpec): PageSourceLine {
  return {
    sourceLabel: "The business website",
    observedLabel: observedMonthYear(spec.generator.generatedAt),
    honestyNote:
      "Claims on this page come from the business's website and are not independently verified.",
  };
}

/**
 * Project compiled page artifacts for one viewer class. The graph is
 * already privacy-projected upstream (verifyPublicProjection, anonymous);
 * this seam decides the experience: which chrome, which affordances, which
 * debug surfaces. Deterministic: identical input + viewer class =
 * identical output.
 */
export function projectForViewer(
  input: ProjectForViewerInput,
  viewerKind: RenderViewerKind,
): ProjectedSiteView {
  return {
    __projectedSiteView: "ProjectedSiteView",
    viewerKind,
    spec: input.spec,
    graph: input.graph,
    findings: viewerKind === "engineer" ? input.findings : [],
    renderable: input.renderable,
    siteId: input.siteId,
    heroMedia: input.heroMedia ?? null,
    galleryMedia: input.galleryMedia ?? null,
    objectMedia: input.objectMedia,
    source: pageSourceLine(input.spec),
    showOwnerEntry: viewerKind !== "visitor",
    ownerConsole:
      viewerKind !== "visitor" ? { entryLabel: "Customize with FYD" } : null,
  };
}
