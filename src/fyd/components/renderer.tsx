/**
 * FYD renderer: (SiteSpec + ObjectGraph + ViewerContext) -> UI.
 *
 * The spec is data. This module resolves each section's query against the
 * graph and renders the registered component. No company-specific
 * hand-layout lives here: every business renders through the same
 * components driven by the same spec shape.
 *
 * Missing data means the section does not exist: resolveQuery returns the
 * objects a query matches, and sections with requiresData render nothing
 * when the list is empty.
 */

import type { OwnerFieldCorrection, PingObject } from "@/lib/ping/types";
import type { CSSProperties, ReactNode } from "react";
import { getComponentDef } from "./registry";
import { AskFydWidget } from "./ask-fyd-widget";
import { ObjectRail, pingObjectToView, richestObject } from "./object-rail";
import { ObjectCard } from "../object/card";
import { ObjectCircle } from "../ui/object-circle";
import { WhyThis, type EvidenceStep } from "../ui/why-this";
import { whyThisClaimChainFor } from "../object/why-this-steps";
import {
  ownerAssertionsFromGraph,
  resolveBoundFieldVerified,
} from "../sitespec/binding-verifier";
import type { BindingClassification } from "../sitespec/graph";
import {
  applyFieldVisibility,
  type FieldVisibilityDecision,
} from "../sitespec/field-visibility";
import { resolveSafeLink, type SafeLinkResult } from "../sitespec/safe-link";
import {
  contactMethodFor,
  type ClaimEvidence,
  type ContactMethod,
  type ContactMethodKind,
} from "../object/object-projection";
import { FydContactLink } from "./contact-link";
import { HeroSection } from "./hero-section";
// RENDER-WIRE: lane-6 theme CSS emission, lane-7 motion CSS (client-safe
// string copy), lane-7 motion primitives, and the lane-4 composition
// vocabulary threshold. All additive imports; no renderer pipeline
// change.
import { emitFydThemeCssForTheme } from "../theme/index";
import { FYD_MOTION_CSS } from "./motion-css-text";
import { Reveal } from "../motion/reveal";
import { BeforeAfter } from "../motion/before-after";
import { MIN_GALLERY_ASSETS } from "../builder/composition";
import { QuietSource } from "./quiet-source";
import {
  observedMonthYear,
  sourceLabelFor,
  type RenderViewerKind,
} from "../sitespec/render-projection";
import { schemaRole, ownerRelationshipTarget } from "../sitespec/schemas";
// Public-copy purity authority: single shared implementation in
// sitespec/public-copy.ts (planner and renderer both use it). Imported for
// local use and re-exported so the renderer's public API is unchanged.
import {
  isProvenanceNarration,
  isUsablePublicTitle,
} from "../sitespec/public-copy";
export {
  hasUsablePublicCopy,
  isHandleFragmentTitle,
  isProvenanceNarration,
  isUsablePublicTitle,
} from "../sitespec/public-copy";
import {
  entranceDurationMs,
  motionTokensForTheme,
  objectViewTransitionName,
  sectionViewTransitionName,
  staggerDelayMs,
} from "./compose-motion";
import {
  ObjectAffordance,
  affordanceEligible,
  affordanceEvidenceLine,
} from "./object-affordance";
// Type-only: erased at compile, so the client bundle never touches the
// server-only media store. The selector runs at the server render seam.
import type { DisplayMedia } from "../media/select";
import type {
  FYDPage,
  FYDQuery,
  FYDPresentation,
  FYDSection,
  FYDSiteSpec,
  FYDThemeTokens,
  FYDDesignIntent,
  FYDLayoutCharacter,
  MotionTokens,
  ObjectGraph,
  ObjectPresence,
  ViewerContext,
} from "../sitespec/types";

// ---------------------------------------------------------------------------
// Query resolution. Deterministic: related sorts by id, feeds sort newest
// first with id as tie-break. Never by insertion or database order.
// ---------------------------------------------------------------------------

export function resolveQuery(
  query: FYDQuery,
  graph: ObjectGraph,
  ownerId: string,
): PingObject[] {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const pub = (o: PingObject) => o.visibility === "public";
  switch (query.kind) {
    case "static":
      return [];
    case "owner": {
      const owner = objects.get(ownerId);
      return owner && pub(owner) ? [owner] : [];
    }
    case "reference": {
      return query.objectIds
        .map((id) => objects.get(id))
        .filter((o): o is PingObject => !!o && pub(o));
    }
    case "related": {
      // Direction-agnostic: the bound object is whichever endpoint of the
      // relationship is not the query anchor (usually the owner). Inverse
      // predicates (works_for, provided_by, published_by) bind exactly
      // like their forward twins. Deduped by id: a pair linked by both
      // employs and member_of still renders one card.
      const seen = new Set<string>();
      const out: PingObject[] = [];
      const predicates = query.predicates ?? [query.predicate];
      for (const r of graph.relationships) {
        if (!predicates.includes(r.predicate)) continue;
        const memberId = ownerRelationshipTarget(r, query.from);
        if (memberId === null || seen.has(memberId)) continue;
        const target = objects.get(memberId);
        const schemaOk =
          !query.schema && !query.schemas
            ? true
            : query.schema
              ? target?.schema === query.schema
              : query.schemas?.includes(target?.schema ?? "");
        if (target && pub(target) && schemaOk) {
          seen.add(memberId);
          out.push(target);
        }
      }
      out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return query.limit ? out.slice(0, query.limit) : out;
    }
    case "all": {
      // Mirrors the "related" case: a bare "all" resolves everything public;
      // query.schema or query.schemas narrows to the listed schemas.
      const schemaOk = (o: PingObject) =>
        !query.schema && !query.schemas
          ? true
          : query.schema
            ? o.schema === query.schema
            : (query.schemas ?? []).includes(o.schema);
      const out = graph.objects.filter((o) => pub(o) && schemaOk(o));
      out.sort((a, b) =>
        a.updatedAt !== b.updatedAt
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.id < b.id
            ? -1
            : 1,
      );
      return query.limit ? out.slice(0, query.limit) : out;
    }
  }
}

/**
 * Owner-approved object ordering (PRESENTATION INTENT layer). Pure and
 * deterministic: ids listed in objectOrder come first, in that order;
 * resolved objects not listed keep their relative query order after
 * them. Unknown ids are ignored, never rendered. Zero customer-specific
 * conditionals: every section component shares this seam.
 */
export function applyObjectOrder(
  objects: PingObject[],
  objectOrder: readonly string[] | undefined,
): PingObject[] {
  if (!objectOrder || objectOrder.length === 0) return objects;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const out: PingObject[] = [];
  for (const id of objectOrder) {
    const o = byId.get(id);
    if (o && !seen.has(id)) {
      seen.add(id);
      out.push(o);
    }
  }
  for (const o of objects) {
    if (!seen.has(o.id)) out.push(o);
  }
  return out;
}

/**
 * Owner-approved object deactivation (PRESENTATION INTENT layer). Pure and
 * deterministic: objects whose id is listed in hiddenObjectIds are removed;
 * every other object keeps its relative order. Unknown ids are ignored,
 * never rendered. Zero customer-specific conditionals: every section
 * component shares this seam.
 */
export function applyHiddenObjects(
  objects: PingObject[],
  hiddenObjectIds: readonly string[] | undefined,
): PingObject[] {
  if (!hiddenObjectIds || hiddenObjectIds.length === 0) return objects;
  const hidden = new Set(hiddenObjectIds);
  return objects.filter((o) => !hidden.has(o.id));
}


/**
 * Site-wide owner deactivation set (PRESENTATION INTENT layer). Pure and
 * deterministic: the union of every section's hiddenObjectIds, in spec
 * order, deduplicated. An object the owner hid in one section must not be
 * promoted anywhere else on the public surface: the Featured Object rail,
 * mobile in-flow composition, and every other section resolve through
 * renderSection, so they all share this exclusion set. Source observations
 * and the canonical graph are untouched; owner/internal tooling still sees
 * the hidden objects. Zero customer-specific conditionals.
 */
export function siteDeactivatedObjectIds(
  spec: FYDSiteSpec,
): readonly string[] | undefined {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      const hidden = section.presentation.hiddenObjectIds;
      if (!hidden) continue;
      for (const id of hidden) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
  }
  return ids.length > 0 ? ids : undefined;
}

// ---------------------------------------------------------------------------
// Section rendering.
// ---------------------------------------------------------------------------

export interface RenderContext {
  spec: FYDSiteSpec;
  /**
   * The projected graph: source state after the owner's field-visibility
   * policy. The renderer never sees withheld fields. Always built via
   * buildRenderContext, never by hand.
   */
  graph: ObjectGraph;
  viewer: ViewerContext;
  /**
   * LANE-8: the classified render viewer kind (visitor | owner | engineer)
   * resolved server-side at the projection seam. Components gate debug
   * chrome on this. Absent preserves legacy rendering for surfaces that
   * pass no kind (debug/developer pages, older tests).
   */
  viewerKind?: RenderViewerKind;
  /**
   * Public site slug (e.g. "happy-place") threaded from the page, so the
   * AskFYD widget knows which site to ask about. Optional: sections render
   * fine without it, but Ask FYD shows an honest unavailable state.
   */
  siteId?: string;
  /**
   * Hero media for the spec owner, resolved once at the server render seam
   * via the canonical media selector (heroMediaFor in src/fyd/media/select).
   * Serialized DisplayMedia: the renderer never selects media itself.
   * Null (or absent) means the owner has no acquired media, and the Hero
   * renders its honest typographic state, never an invented image.
   */
  heroMedia?: DisplayMedia | null;
  /**
   * Gallery media for the spec owner, resolved once at the server render
   * seam via galleryMediaFor (same pattern as heroMedia). Serialized
   * DisplayMedia. Null (or empty) means the Gallery section renders
   * nothing: missing data means the section does not exist.
   */
  galleryMedia?: DisplayMedia[] | null;
  /**
   * Per-object media for objects on the rendered page, keyed by object
   * id, resolved once at the server render seam via listObjectMedia.
   * Serialized DisplayMedia. Lets cards, strips, and feeds go visual only
   * where the graph actually has media: structural differentiation from
   * the graph, never hand-built sections.
   */
  objectMedia?: Record<string, DisplayMedia[]>;
}

/**
 * Build the render context at the projection seam.
 *
 * This is the ONLY supported way to obtain a RenderContext: the source
 * graph is projected through the owner's field-visibility decisions
 * first, so the renderer executes the resulting projection and never
 * touches withheld fields. Source state is never mutated; the projected
 * graph is a new value. With no decisions, the conservative defaults in
 * field-visibility.ts apply.
 */
export function buildRenderContext(
  spec: FYDSiteSpec,
  sourceGraph: ObjectGraph,
  viewer: ViewerContext,
  ownerDecisions: FieldVisibilityDecision[] = [],
): RenderContext {
  return {
    spec,
    graph: applyFieldVisibility(sourceGraph, ownerDecisions),
    viewer,
  };
}

interface SectionProps {
  section: FYDSection;
  objects: PingObject[];
  presentation: FYDPresentation;
  theme: FYDThemeTokens;
  ctx: RenderContext;
  /**
   * Page-order index of the section (compose lane): drives restrained
   * stagger on scroll entrance. Defaults to 0.
   */
  motionIndex?: number;
}

function friendlySchemaLabel(schema: string): string {
  const local = schema.split(".").pop() ?? schema;
  const name = local.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Claim badge (2026-09-22): the badge names the actual claim source for
 * the objects it labels. Website-derived content is the site's own words;
 * canonical journal content is a site record; overlay-authored content is
 * a demo addition. A mixed section says "Mixed sources" rather than
 * stamping one label on everything.
 */
export function claimBadgeLabel(objects: PingObject[]): string {
  const labels = new Set(
    objects.map((o) => {
      if (o.provenance?.kind === "overlay-authored") return "Demo addition";
      const claimKind =
        typeof o.fields["claimKind"] === "string" ? o.fields["claimKind"] : "";
      if (claimKind === "feed_item") return "Feed item";
      if (claimKind === "website_statement") return "Website statement";
      return "Site record";
    }),
  );
  if (labels.size === 1) return [...labels][0];
  return "Mixed sources";
}

/**
 * VQ-002: the badge defaults to the light-surface treatment
 * (border-border-soft / text-accent). On the dark hero slab (theme.ink) those
 * light-theme tokens are illegible, so the Hero passes tone="onDark": text in
 * text-background (the same token as the hero h1, proven legible on ink)
 * with a theme.accent border (the same treatment as the Ask FYD button border
 * on the same slab). Theme tokens only; no invented colors, no literal
 * RGB-complement math.
 */
function ClaimBadge({
  objects,
  theme,
  tone,
  viewerKind,
  ctx,
}: {
  objects: PingObject[];
  theme?: FYDThemeTokens;
  tone?: "onDark";
  /**
   * LANE-8: the debug-semantics pill is replaced by the quiet Source
   * affordance (progressive disclosure) for every viewer except the
   * engineer. Absent fails closed to the quiet treatment.
   */
  viewerKind?: RenderViewerKind;
  /** Render context, for the binding-verified usable-content gate. */
  ctx: RenderContext;
}) {
  if (viewerKind !== "engineer") {
    // Data-absent rule (polish lane, 2026-09-26): the quiet Source
    // affordance needs something to source. When the objects carry no
    // usable public content (unbound / narration / handle-fragment
    // titles), the disclosure renders nothing. The check runs on the
    // binding-verified title, the same authority as the section gates.
    if (!objects.some((o) => isUsablePublicTitle(boundTitle(ctx, o), o.schema))) return null;
    return <QuietSource objects={objects} />;
  }
  const dark = tone === "onDark" && theme != null;
  return (
    <span
      className={
        "inline-block rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide" +
        (dark ? " text-background" : " border-border-soft text-accent")
      }
      style={dark && theme ? { borderColor: theme.accent } : undefined}
    >
      {claimBadgeLabel(objects)}
    </span>
  );
}

/**
 * The owner correction attached to the composed object for a field, if the
 * owner corrected it. The read seam (owner-overlay.ts) attaches these; the
 * renderer reads them generically, never per-surface special-cased.
 */
function correctionFor(
  o: PingObject,
  field: string,
): OwnerFieldCorrection | null {
  const list = o.ownerFieldCorrections;
  if (!list) return null;
  return list.find((c) => c.field === field) ?? null;
}

/**
 * Honest SOURCE SAYS X / OWNER SAYS Y note under a corrected value.
 * Customer-appropriate and contextual: it names both values and says the
 * number came from the owner, without engineering language.
 */
function CorrectionNote({
  correction,
  theme,
}: {
  correction: OwnerFieldCorrection;
  theme: FYDThemeTokens;
}) {
  return (
    <p className="mt-1 text-xs" style={{ color: theme.ink, opacity: 0.65 }}>
      Owner-corrected: the owner says this is the {correction.label.toLowerCase()}
      {correction.sourceValue
        ? ` (the site lists ${correction.sourceValue})`
        : " (the site listed no " + correction.label.toLowerCase() + ")"}
      .
    </p>
  );
}

function fieldOf(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "";
}

// ---------------------------------------------------------------------------
// Compose lane: presentation character, motion, object cards, gallery.
//
// layoutCharacter is a PRESENTATION hint chosen by the composing
// strategy/archetype (SiteSpec.themeTokens), owner-overridable. It changes
// presentation tokens only: type scale, rhythm, card elevation. Facts
// never change with it. Motion semantics come from theme.motionTokens;
// the renderer owns the implementation (native CSS + View Transitions
// API, transform/opacity only, zero new dependencies).
// ---------------------------------------------------------------------------

/** Presentation-only readouts per layout character. Never facts. */
const CHARACTER_PRESENTATION: Record<
  FYDLayoutCharacter,
  {
    /** Section vertical rhythm in px (inline style: Tailwind-safe). */
    sectionRhythmPx: number;
    /** Heading letter-spacing. */
    headingTracking: string;
    /** Card elevation style. */
    cardElevation: "flat" | "layered";
    /** Hero heading scale multiplier. */
    heroScale: number;
    /** Design-system compiler seed: content density. */
    density: "compact" | "comfortable";
    /** Design-system compiler seed: center column width in px. */
    contentWidthPx: number;
    /** Design-system compiler seed: media treatment on small screens. */
    mediaTreatment: "contained" | "edge-to-edge";
    /** Design-system compiler seed: how hard objects push for attention. */
    objectEmphasis: "quiet" | "balanced" | "prominent";
  }
> = {
  EDITORIAL: { sectionRhythmPx: 56, headingTracking: "-0.015em", cardElevation: "flat", heroScale: 1.12, density: "comfortable", contentWidthPx: 1024, mediaTreatment: "contained", objectEmphasis: "balanced" },
  CRAFT: { sectionRhythmPx: 48, headingTracking: "0em", cardElevation: "layered", heroScale: 1.05, density: "comfortable", contentWidthPx: 1024, mediaTreatment: "edge-to-edge", objectEmphasis: "balanced" },
  TECHNICAL: { sectionRhythmPx: 40, headingTracking: "0.04em", cardElevation: "flat", heroScale: 1.0, density: "compact", contentWidthPx: 1152, mediaTreatment: "contained", objectEmphasis: "quiet" },
  RETAIL: { sectionRhythmPx: 48, headingTracking: "0em", cardElevation: "layered", heroScale: 1.05, density: "comfortable", contentWidthPx: 1024, mediaTreatment: "edge-to-edge", objectEmphasis: "prominent" },
  PROFESSIONAL: { sectionRhythmPx: 48, headingTracking: "0.01em", cardElevation: "flat", heroScale: 1.05, density: "comfortable", contentWidthPx: 1024, mediaTreatment: "contained", objectEmphasis: "balanced" },
  CREATOR: { sectionRhythmPx: 56, headingTracking: "-0.01em", cardElevation: "layered", heroScale: 1.12, density: "comfortable", contentWidthPx: 1024, mediaTreatment: "edge-to-edge", objectEmphasis: "prominent" },
};

/**
 * Design-system compiler (mobile architecture): deterministic map from
 * semantic design intent to presentation tokens. The owner-approved
 * theme.designIntent overrides win field-by-field; the layoutCharacter
 * map is the default. The LLM/agent proposes INTENT patches (never CSS);
 * the owner approves through the token-override path; this function
 * compiles. No arbitrary CSS generation anywhere in the pipeline.
 */
export interface FYDCompiledIntent {
  density: "compact" | "comfortable";
  contentWidthPx: number;
  mediaTreatment: "contained" | "edge-to-edge";
  objectEmphasis: "quiet" | "balanced" | "prominent";
}

export function designIntentForTheme(theme: FYDThemeTokens): FYDCompiledIntent {
  const c = CHARACTER_PRESENTATION[characterOf(theme)];
  const d: FYDDesignIntent = theme.designIntent ?? {};
  return {
    density: d.density ?? c.density,
    contentWidthPx: d.contentWidthPx ?? c.contentWidthPx,
    mediaTreatment: d.mediaTreatment ?? c.mediaTreatment,
    objectEmphasis: d.objectEmphasis ?? c.objectEmphasis,
  };
}

function characterOf(theme: FYDThemeTokens): FYDLayoutCharacter {
  return theme.layoutCharacter ?? "EDITORIAL";
}

/**
 * Inline style carrying a view-transition name. React 18 does not know
 * the camelCase viewTransitionName prop (React 19 does); the hyphenated
 * key renders correctly into SSR markup (verified) with a dev-only
 * warning, and the browser honors it.
 */
function vtNameStyle(name: string | undefined): CSSProperties {
  return name ? ({ viewTransitionName: name } as unknown as CSSProperties) : {};
}

/**
 * One <style> per page, emitted by SitePageView. Native CSS only:
 *
 * - View transitions: `@view-transition { navigation: auto }`, with the
 *   element names stamped inline by the renderer from stable ids (MORPH
 *   only; CROSSFADE stamps no names and the browser crossfades).
 * - Scroll entrance, restrained: `animation-timeline: view()` where
 *   supported, behind the double gate
 *   (prefers-reduced-motion: no-preference + @supports). The
 *   IntersectionObserver fallback (useFydScrollEntrance) arms the .fyd-io
 *   path only when the native timeline is unsupported.
 * - Card hover: transform + shadow only. Affordance preview pop.
 * - @starting-style for DOM-insertion enters.
 * - Soft tonal section alternation via color-mix, scoped to .fyd-section.
 *
 * Everything collapses under prefers-reduced-motion: reduce. NEVER
 * hijacks scrolling: no scroll-linked layout shifts, no position
 * changes, only opacity/transform entrances.
 */
function FydMotionStyles({ theme }: { theme: FYDThemeTokens }) {
  const motion: MotionTokens = motionTokensForTheme(theme);
  const character = characterOf(theme);
  const dur = entranceDurationMs(motion);
  const collapsed = motion.motionIntensity === "NONE" || dur === 0;
  // Mobile composition CSS: NOT gated on reduced motion. One semantic
  // SiteSpec, one DOM; the projection adapts per device. Breakpoints
  // mirror the ViewportWidthClass cut points (xs <480, sm 480-767,
  // md 768-1023, lg 1024-1439, xl 1440+).
  const composition = [
    // Object card: compact tile by default (mobile-first). At md+ the
    // same DOM projects as a rich horizontal card. Same object,
    // different projection; no squeezed desktop at 375px.
    ".fyd-card { display: grid; grid-template-columns: 1fr; }",
    ".fyd-card .fyd-card-media { margin-bottom: 0.9rem; }",
    "@media (min-width: 768px) {",
    // Rich horizontal card ONLY when the card actually carries media:
    // the media anchors column 1 and spans the text rows, every other
    // child flows in column 2. Media-less cards stay single-column so
    // text never squeezes into a narrow rail (flat-DOM auto-placement
    // put the description in column 2 by itself).
    ".fyd-card.fyd-card-rich:has(.fyd-card-media) { grid-template-columns: minmax(0, 240px) minmax(0, 1fr); column-gap: 1.25rem; align-items: start; }",
    ".fyd-card.fyd-card-rich:has(.fyd-card-media) .fyd-card-media { grid-column: 1; grid-row: 1 / span 8; margin-bottom: 0; height: 100%; }",
    ".fyd-card.fyd-card-rich:has(.fyd-card-media) > :not(.fyd-card-media) { grid-column: 2; }",
    "}",
    // Compact tile density: lower information density on mobile.
    // Description clamps to two lines (progressive disclosure via the
    // detail link); microcopy and affordance stay fully visible.
    ".fyd-card-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
    "@media (min-width: 768px) { .fyd-card-desc { -webkit-line-clamp: unset; } }",
    // Touch targets: 44px minimum on every interactive element.
    // No hover-dependent interactions: affordance is tap-native
    // (details/summary); on touch the quiet cues render fully visible.
    ".fyd-card h3 a { display: inline-flex; align-items: center; min-height: 44px; }",
    ".fyd-affordance summary { min-height: 44px; display: inline-flex; align-items: center; }",
    "@media (hover: none) {",
    ".fyd-card .fyd-reln { opacity: .9; }",
    ".fyd-card .fyd-affordance-mark { opacity: .95; }",
    ".fyd-card { transition: none; }",
    "}",
    // Safe-area insets: the page never tucks content under notches or
    // home indicators.
    ".fyd-safe-area { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); padding-bottom: env(safe-area-inset-bottom); }",
    // Gallery: edge-to-edge media moments on xs when the design intent
    // asks for them; calm grids above.
    "@media (max-width: 479px) {",
    ".fyd-gallery-grid[data-media-treatment='edge-to-edge'] { grid-template-columns: 1fr; margin-left: -1rem; margin-right: -1rem; }",
    ".fyd-gallery-grid[data-media-treatment='edge-to-edge'] figure { margin: 0; }",
    "}",
    // People rail: gesture-friendly with scroll snap on touch.
    ".fyd-people-rail { scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }",
    ".fyd-people-rail > * { scroll-snap-align: start; }",
  ].join("\n");
  const motionCss = collapsed
    ? "/* fyd-motion: intensity NONE, decorative motion collapsed */"
    : [
        "@media (prefers-reduced-motion: no-preference) {",
        "@view-transition { navigation: auto; }",
        ".fyd-hero-settle { animation: fyd-hero-settle 560ms cubic-bezier(.2,.7,.2,1) both; }",
        "@keyframes fyd-hero-settle { from { transform: translateY(14px); } to { transform: none; } }",
        "@supports (animation-timeline: view()) {",
        "[data-motion='enter'] { animation: fyd-enter " +
          dur +
          "ms cubic-bezier(.2,.7,.2,1) both; animation-timeline: view(); animation-range: entry 0% cover 30%; }",
        // VQ-001: motion never gates content. The native view() timeline can
        // hold below-fold elements at progress 0 in full-page captures, print,
        // crawlers, and no-scroll contexts, so entrances keep their slide but
        // never touch opacity: content is always painted.
        "@keyframes fyd-enter { from { transform: translateY(16px); } to { transform: none; } }",
        "}",
        // Base state is VISIBLE. JS adds .fyd-io-pending only to below-fold elements.
        // VQ-001: the pending entrance is transform-only; opacity never gates content.
        ".fyd-io [data-motion='enter'] { transition: transform 480ms ease; }",
        ".fyd-io [data-motion='enter'].fyd-io-pending { transform: translateY(16px); }",
        ".fyd-io [data-motion='enter'].fyd-inview, .fyd-io [data-motion='enter']:not(.fyd-io-pending) { opacity: 1; transform: none; }",
        ".fyd-io [data-motion='enter'].fyd-force-visible { opacity: 1 !important; transform: none !important; animation: none !important; }",
        // VQ-001: print and other non-interactive renderings show everything.
        "@media print { [data-motion='enter'], .fyd-hero-settle { animation: none !important; opacity: 1 !important; transform: none !important; } }",
        "@media (hover: hover) {",
        ".fyd-card { transition: transform 240ms ease, box-shadow 240ms ease; }",
        ".fyd-card:hover { transform: translateY(-4px); }",
        ".fyd-card .fyd-affordance-mark { opacity: .55; transition: opacity 160ms ease; }",
        ".fyd-card:hover .fyd-affordance-mark, .fyd-card:focus-within .fyd-affordance-mark { opacity: 1; }",
        ".fyd-card .fyd-reln { opacity: .45; transition: opacity 200ms ease; }",
        ".fyd-card:hover .fyd-reln, .fyd-card:focus-within .fyd-reln { opacity: .9; }",
        "}",
        ".fyd-affordance-preview { animation: fyd-pop 180ms ease-out both; }",
        "@keyframes fyd-pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }",
        "@starting-style { .fyd-affordance-preview { opacity: 0; transform: translateY(-4px) scale(.98); } }",
        ".fyd-section:nth-of-type(even) { background: color-mix(in srgb, var(--fyd-surface, #ffffff) 95%, var(--fyd-ink, #000000)); }",
        "}",
      ].join("\n");
  // RENDER-WIRE: lane-6 type/spacing tokens and lane-7 motion keyframes
  // ride the per-page <style> block (SitePageView renders FydMotionStyles
  // once per page). The page carries its own tokens: no global
  // stylesheet dependency, no cross-tenant leakage.
  const css =
    composition +
    "\n" +
    motionCss +
    "\n" +
    emitFydThemeCssForTheme(theme) +
    "\n" +
    FYD_MOTION_CSS;
  return <style data-fyd-motion={character}>{css}</style>;
}

/**
 * First photographic DisplayMedia for an object: logos are brand
 * identity, never card covers. Null when the object has no displayable
 * photographic media.
 */
function photographicMedia(
  list: DisplayMedia[] | undefined,
): DisplayMedia | null {
  if (!list) return null;
  return list.find((m) => m.role !== "logo") ?? null;
}

// Relationship predicates for microcopy. Generic vocabulary, never
// business-specific: the line names the connection the graph recorded.
const PERSON_ORG_PREDICATES = [
  "employs",
  "member_of",
  "works_for",
  "founded_by",
  "has_member",
];
const SERVICE_PLACE_PREDICATES = [
  "located_at",
  "serves",
  "available_in",
  "serves_area",
];
const MAKER_PREDICATES = ["published_by", "created_by", "authored_by", "provided_by"];

/**
 * Relationship microcopy for a card: one quiet line naming the
 * connection, e.g. "Maya Alvarez -> Happy Place Carpentry" on a person
 * card, or "Available in Grand Junction, Fruita" on a service card.
 * No giant graph visualization. Titles go through the binding verifier;
 * an unverified title kills the line instead of guessing. Hovering the
 * card subtly reveals the connection (CSS on .fyd-reln).
 */
function relationshipLine(
  ctx: RenderContext,
  o: PingObject,
): string | null {
  const role = schemaRole(o.schema);
  const graph = ctx.graph;
  const byId = new Map(graph.objects.map((x) => [x.id, x]));
  const active = graph.relationships.filter((r) => r.status === "active");
  const titleOf = (id: string): string | undefined => {
    const t = byId.get(id);
    return t && t.visibility === "public" ? boundTitle(ctx, t) : undefined;
  };
  if (role === "person") {
    const name = boundTitle(ctx, o);
    if (!name) return null;
    for (const r of active) {
      if (r.object !== o.id) continue;
      if (!PERSON_ORG_PREDICATES.includes(r.predicate)) continue;
      const org = titleOf(r.subject);
      if (org) return `${name} -> ${org}`;
    }
    return null;
  }
  if (role === "service" || role === "product") {
    const places: string[] = [];
    for (const r of active) {
      if (r.subject !== o.id) continue;
      if (!SERVICE_PLACE_PREDICATES.includes(r.predicate)) continue;
      const t = titleOf(r.object);
      if (t && !places.includes(t)) places.push(t);
    }
    if (places.length > 0)
      return `Available in ${places.slice(0, 4).join(", ")}`;
  }
  for (const r of active) {
    if (r.subject !== o.id) continue;
    if (!MAKER_PREDICATES.includes(r.predicate)) continue;
    const maker = titleOf(r.object);
    if (maker) return `By ${maker}`;
  }
  for (const r of active) {
    if (r.object !== o.id) continue;
    if (!MAKER_PREDICATES.includes(r.predicate)) continue;
    const maker = titleOf(r.subject);
    if (maker) return `By ${maker}`;
  }
  return null;
}

/**
 * The object card: renders from the object graph, never hand content.
 *
 * Hover/tap behavior: lift/depth change on hover (transform + shadow,
 * CSS), identity persistence via the view-transition name on the title
 * (card -> detail morphs the same object), tap opens the object detail
 * through the title link. The FYD mark affordance (canonical types only)
 * opens the preview. Objects with photographic media get a visual cover:
 * structural differentiation from the graph. The relationship microcopy
 * names the object's connection in one quiet line.
 */
function FydObjectCard({
  o,
  theme,
  ctx,
  index,
  kicker,
}: {
  o: PingObject;
  theme: FYDThemeTokens;
  ctx: RenderContext;
  index: number;
  /** Optional kind line under the title (e.g. a person's role). Bound by the caller. */
  kicker?: string | null;
}) {
  const title = boundTitle(ctx, o);
  const description = boundDescription(ctx, o);
  const motion = motionTokensForTheme(theme);
  const character = characterOf(theme);
  const char = CHARACTER_PRESENTATION[character];
  const media = photographicMedia(ctx.objectMedia?.[o.id]);
  const morph =
    motion.objectTransition === "MORPH" && motion.motionIntensity !== "NONE";
  const vtName = morph ? objectViewTransitionName(o.id) : undefined;
  const delay = staggerDelayMs(index, motion);
  const reln = relationshipLine(ctx, o);
  const detailHref = `/o/${encodeURIComponent(o.id)}`;
  const radius = theme.radius === "none" ? 0 : 8;
  return (
    <article
      className="fyd-card fyd-card-rich border border-border-soft p-5"
      data-motion="enter"
      data-motion-index={index}
      data-layout-character={character}
      style={{
        position: "relative",
        background: theme.surface,
        borderRadius: radius,
        boxShadow:
          char.cardElevation === "layered"
            ? (theme.shadows?.sm ?? "0 1px 3px rgba(0,0,0,0.08)")
            : "none",
        animationDelay: delay ? `${delay}ms` : undefined,
        transitionDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {media ? (
        <img
          className="fyd-card-media"
          src={media.src}
          alt={media.alt}
          width={media.width}
          height={media.height}
          loading="lazy"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{
            width: "100%",
            height: "auto",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            borderRadius: radius,
            display: "block",
            marginBottom: "0.9rem",
          }}
        />
      ) : null}
      {title ? (
        <h3
          className="text-lg font-semibold"
          style={{ color: theme.ink, ...vtNameStyle(vtName) }}
        >
          <a
            href={detailHref}
            data-fyd-object-id={o.id}
            style={{ color: "inherit", textDecoration: "none" }}
            role="button"
            tabIndex={0}
            aria-expanded="false"
            aria-label={title}
          >
            {title}
          </a>
        </h3>
      ) : null}
      {kicker ? (
        <p className="text-sm font-medium" style={{ color: theme.accent }}>
          {kicker}
        </p>
      ) : null}
      {description ? (
        <p className="fyd-card-desc mt-2 text-sm text-accent">{description}</p>
      ) : null}
      {reln ? (
        <p className="fyd-reln mt-2 text-xs" style={{ color: theme.ink }}>
          {reln}
        </p>
      ) : null}
      <div className="mt-3">
        <ClaimBadge objects={[o]} viewerKind={ctx.viewerKind} ctx={ctx} />
      </div>
      {/* LANE-8: the per-claim WhyThis drill-down is engineer material.
          The visitor and owner get the quiet Source affordance instead. */}
      {ctx.viewerKind === "engineer" && title ? (
        <WhyThis
          claim={title}
          steps={whyThisClaimChainFor(o)}
          className="mt-2"
          viewerKind={ctx.viewerKind}
        />
      ) : null}
      {/* Visitor-projection purity (polish lane, 2026-09-26): platform-brand
          chrome (FydMark / the object affordance) is an owner/engineer
          surface. The component itself is the fail-closed authority: it
          renders only for viewerKind "owner"/"engineer", so visitor cards
          (and any context that passes no kind) render no ObjectAffordance. */}
      {affordanceEligible(o) ? (
        <ObjectAffordance
          viewerKind={ctx.viewerKind}
          objectId={o.id}
          title={title ?? null}
          kindLabel={friendlySchemaLabel(o.schema)}
          schemaId={o.schema}
          controllerId={o.controllerId}
          evidenceLine={ctx.viewerKind !== "engineer" ? sourceLabelFor(o) : affordanceEvidenceLine(o)}
          theme={theme}
        />
      ) : null}
    </article>
  );
}

/**
 * ObjectDoorway: the generic compact object tap-target.
 *
 * One honest line that opens the object in the rich ObjectOverlay (the
 * site client intercepts the /o/<id> href; modifier-clicks still open the
 * node route). Used wherever a section renders an object WITHOUT a full
 * card (Hero, feed items): identity + kind label, nothing invented. The
 * doorway is the anti-flattening primitive: every public object resolved
 * by a section query carries at least one of these in the rendered HTML,
 * on every viewport. Same objects, same graph; responsive projection
 * decides placement, never whether the identity exists.
 *
 * - title is the binding-verified title: no binding, no doorway.
 * - data-fyd-object-id is the stable hook the interaction layer keys on.
 * - tone onDark suits dark surfaces (Hero); default suits light ones.
 */
export function ObjectDoorway({
  o,
  theme,
  ctx,
  tone = "default",
  className,
}: {
  o: PingObject;
  theme: FYDThemeTokens;
  ctx: RenderContext;
  tone?: "default" | "onDark";
  className?: string;
}) {
  const title = boundTitle(ctx, o);
  if (!title) return null;
  const detailHref = `/o/${encodeURIComponent(o.id)}`;
  const kindLabel = friendlySchemaLabel(o.schema);
  const dark = tone === "onDark";
  return (
    <a
      href={detailHref}
      data-fyd-object-id={o.id}
      role="button"
      tabIndex={0}
      aria-expanded="false"
      className={"fyd-object-doorway " + (className ?? "")}
      style={{
        display: "inline-flex",
        maxWidth: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        gap: "0.5rem",
        minHeight: "44px",
        padding: "0.5rem 0.9rem",
        borderRadius: 9999,
        border: "1px solid",
        borderColor: dark ? "rgba(255,255,255,0.35)" : theme.accent,
        color: dark ? "#fff" : theme.ink,
        background: dark ? "rgba(255,255,255,0.08)" : "transparent",
        fontSize: "0.875rem",
        fontWeight: 600,
        textDecoration: "none",
      }}
      aria-label={`Open ${kindLabel} object: ${title}`}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "0.7rem",
          height: "0.7rem",
          borderRadius: "50%",
          background: theme.accent,
          boxShadow: "inset 0 0 0 2px " + (dark ? "rgba(0,0,0,0.35)" : theme.surface),
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "16rem" }}>
        {/* Public-projection purity (polish lane, 2026-09-26): the visible
            label is the object's own title. The kind rides only in the
            aria-label above: visitors read the business's words, not the
            graph's vocabulary ("Business: ..."). */}
        {title}
      </span>
      <span aria-hidden="true" style={{ opacity: 0.7 }}>
        {"->"}
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Projection seam: binding verification + safe links.
//
// Every FACTUAL value rendered below is read through boundField /
// boundTitle / boundDescription, which resolve the value via the STRONG
// BindingVerifier (verifyBinding in sitespec/binding-verifier.ts, through
// resolveBoundFieldVerified). A value whose binding does not verify
// returns undefined, and the caller OMITS it: no binding, no factual
// output. In particular, owner_authored bindings require a recorded owner
// assertion, exactly as the planner's emission seam enforces (LANE-CLAIM
// H4/R-H4 reconciliation). This is the verifier wired into the actual
// projection path, not a sidecar.
//
// Labels, action text ("Visit website", "Ask FYD"), section headings that
// come from presentation (generated copy), and structural text are not
// factual claims and do not go through the verifier.
//
// Every EXTERNAL href is resolved through resolveSafeLink. Only a
// { kind: "safe" } result becomes an anchor element; anything else renders
// no link at all. The renderer never interpolates a raw observed string
// into href/src. Internal anchors ("#ask") are presentation state, not
// untrusted external data, and are unaffected.
// ---------------------------------------------------------------------------

/**
 * Data-absent rule (polish lane, 2026-09-26): an object has usable public
 * content when its bound title is usable. Sections whose objects ALL lack
 * a usable title are omitted by their section component (People,
 * ObjectRail, and the card sections below). The title is the object's
 * public identity; a handle fragment with a narration description
 * ("coppersmithplm" / "Person described in the website's structured
 * data.") is not content, it is ingestion residue.
 */
export function sectionHasUsableContent(
  ctx: RenderContext,
  objects: PingObject[],
): boolean {
  return objects.some((o) => isUsablePublicTitle(boundTitle(ctx, o), o.schema));
}

/**
 * Verified factual field read. Returns the value only when the binding
 * verifies against the STRONG BindingVerifier (LANE-CLAIM H4/R-H4);
 * undefined means the caller must OMIT the value, never guess.
 */
function boundField(
  ctx: RenderContext,
  o: PingObject,
  field: string,
  classification: BindingClassification = "direct",
): string | undefined {
  // Owner assertions ride on the render graph; the strong verifier
  // requires a recorded assertion for owner_authored bindings. Pure and
  // deterministic; trivial cost at demo graph sizes.
  return resolveBoundFieldVerified(
    ctx.graph,
    { objectId: o.id, field, classification },
    ownerAssertionsFromGraph(ctx.graph),
  );
}

/** Verified title read (object-level factual identity). */
function boundTitle(ctx: RenderContext, o: PingObject): string | undefined {
  return boundField(ctx, o, "title");
}

/** Verified description read (object-level factual identity). Never binds
 * provenance narration as public copy: a narration match falls back to
 * title-only (returns undefined). */
function boundDescription(ctx: RenderContext, o: PingObject): string | undefined {
  const d = boundField(ctx, o, "description");
  if (d !== undefined && isProvenanceNarration(d)) return undefined;
  return d;
}

/** Owner website URL gated to a safe navigable href. Never a raw string. */
function safeWebsite(ctx: RenderContext): SafeLinkResult {
  return resolveSafeLink(boundWebsite(ctx), "navigate");
}

/**
 * Website URL through the binding verifier: the owner's "website" field,
 * else the first "url" of a related website object. Mirrors
 * resolveWebsiteUrl's lookup order, but every hop is a verified binding;
 * an unverified website is not a linkable fact.
 */
function boundWebsite(ctx: RenderContext): string | undefined {
  const graph = ctx.graph;
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const owner = objects.get(ctx.spec.ownerObjectId);
  if (owner && owner.visibility === "public") {
    const direct = boundField(ctx, owner, "website");
    if (direct !== undefined) return direct;
  }
  for (const r of graph.relationships) {
    if (r.subject !== ctx.spec.ownerObjectId) continue;
    if (r.status !== "active" || r.predicate !== "has_website") continue;
    const target = objects.get(r.object);
    if (target && target.visibility === "public") {
      const url = boundField(ctx, target, "url");
      if (url !== undefined) return url;
    }
  }
  return undefined;
}

/**
 * ContactMethod projection for one contact field ("phone" | "email").
 *
 * Binding-verified through boundField (the same verifier as every factual
 * value on this surface), then safety-gated through contactMethodFor: an
 * unverifiable or unsafe number/email is not a contact method and the
 * caller renders nothing. Evidence comes from the object's own provenance
 * (the "direct" binding's evidence ref) or the owner's correction record
 * (owner-attested state). Never invented.
 */
function contactMethod(
  ctx: RenderContext,
  o: PingObject,
  kind: ContactMethodKind,
  correction: OwnerFieldCorrection | null,
): ContactMethod | null {
  const value = boundField(ctx, o, kind, correction ? "owner_authored" : "direct");
  if (value === undefined) return null;
  // Fail-closed dial gating (OBJECT-SHARD-2): an explicit field-conflict
  // marker blocks the dial/mailto action. An explicit owner correction is a
  // human resolution of the field and outranks preserved conflict markers.
  if (!correction && contactFieldConflicted(ctx, o, kind)) return null;
  return contactMethodFor(kind, value, contactEvidence(o, kind, correction));
}

/**
 * Explicit conflict marker for one contact kind ("phone" | "email") on a
 * single object. Two marker shapes are honored, both explicit:
 *   - a "<kind>_conflicts_with" field naming the disputed value, or
 *   - a "conflicts" entry that names both the field kind and a conflict
 *     (e.g. "PHONE CONFLICT: website lists X; directory lists Y").
 * Free-text notes that do not name the kind are not markers.
 */
function fieldConflictMarker(o: PingObject, kind: ContactMethodKind): boolean {
  const fields = o.fields as Record<string, unknown>;
  const explicit = fields[`${kind}_conflicts_with`];
  if (typeof explicit === "string" && explicit.trim().length > 0) return true;
  const conflicts = fields["conflicts"];
  if (Array.isArray(conflicts)) {
    const needle = kind.toLowerCase();
    for (const c of conflicts) {
      if (typeof c !== "string") continue;
      const lc = c.toLowerCase();
      if (lc.includes("conflict") && lc.includes(needle)) return true;
    }
  }
  return false;
}

/**
 * Whether a dial/mailto action must be blocked for this contact field.
 * Checks the object's own fields plus one-hop active public relationships
 * (conflict evidence often lives on a linked external-identity object).
 * The conflicting values stay in the graph (both claims preserved); only
 * the action is blocked.
 */
function contactFieldConflicted(
  ctx: RenderContext,
  o: PingObject,
  kind: ContactMethodKind,
): boolean {
  if (fieldConflictMarker(o, kind)) return true;
  for (const r of ctx.graph.relationships) {
    if (r.status !== "active") continue;
    const otherId = r.subject === o.id ? r.object : r.object === o.id ? r.subject : null;
    if (!otherId) continue;
    const t = ctx.graph.objects.find((x) => x.id === otherId);
    if (t && t.visibility === "public" && fieldConflictMarker(t, kind)) return true;
  }
  return false;
}

/** Evidence basis for a rendered contact method. */
function contactEvidence(
  o: PingObject,
  kind: ContactMethodKind,
  correction: OwnerFieldCorrection | null,
): ClaimEvidence {
  if (correction) {
    const steps: EvidenceStep[] = [
      { step: "Owner decision", detail: correction.basis, state: "observed" },
    ];
    if (correction.sourceValue) {
      steps.push({
        step: "The site listed",
        detail: correction.sourceValue,
        state: "observed",
      });
    }
    return {
      state: "observed",
      receipt: "the business owner",
      asOf: correction.correctedAt.slice(0, 10),
      steps,
    };
  }
  const ref = o.provenance?.ref ?? "";
  return {
    state: "observed",
    receipt: provenanceReceipt(ref),
    asOf: (o.provenance?.derivedAt ?? "").slice(0, 10) || undefined,
    steps: [
      { step: "Object field", detail: kind, state: "observed" },
      { step: "Source", detail: ref, state: "observed" },
    ],
  };
}

/**
 * Quiet receipt for a provenance ref, e.g. "example.com" for
 * "website-ingestion:https://example.com/". Deterministic.
 */
function provenanceReceipt(ref: string): string {
  const m = /https?:\/\/([^/]+)/.exec(ref);
  if (m) return m[1].replace(/^www\./, "");
  const trimmed = ref.trim();
  return trimmed === "" ? "the business website" : trimmed;
}

function SectionShell({
  heading,
  copy,
  children,
  theme,
  sectionId,
  motionIndex,
}: {
  heading?: string;
  copy?: string;
  children: ReactNode;
  theme: FYDThemeTokens;
  /** Registry section id, for the data-fyd-section hook. */
  sectionId?: string;
  /** Page-order index, for restrained stagger. */
  motionIndex?: number;
}) {
  const motion = motionTokensForTheme(theme);
  const character = characterOf(theme);
  const morph =
    motion.objectTransition === "MORPH" && motion.motionIntensity !== "NONE";
  const delay =
    motionIndex !== undefined ? staggerDelayMs(motionIndex, motion) : 0;
  return (
    <section
      // RENDER-WIRE: 1280px container (lane-6 --fyd-container-max), section
      // rhythm 64-128px (lane-6 --fyd-space-section-major). The container and
      // rhythm are tokens, so a tenant theme can override without layout
      // edits. max-w-5xl is intentionally gone.
      className="fyd-section mx-auto w-full px-4 sm:px-6"
      data-fyd-section={sectionId}
      // In-flow object anchor (2026-09-24 Phase 2): the section's
      // document spot doubles as its objects' data-object-anchor.
      // The mobile in-flow composition renders at this exact spot.
      data-object-anchor={sectionId}
      // No data-motion="enter" on the section itself: sections are layout
      // containers that may host lane-owned position:fixed UI (e.g. the
      // object rail's trigger). A transform/opacity entrance animation on
      // the section would reparent those fixed descendants to the section
      // while the animation's fill is active. Motion belongs on content
      // items (cards, figures), never on the container.
      data-layout-character={character}
      style={
        {
          ["--fyd-surface" as string]: theme.surface,
          ["--fyd-ink" as string]: theme.ink,
          maxWidth: "var(--fyd-container-max, 80rem)",
          // Polish lane (2026-09-26): content-poor sections (no heading,
          // no copy) do not earn the full major section rhythm. They
          // collapse to the minor section token so thin sections stop
          // reading as empty gaps. The tokens stay tenant-overridable.
          paddingTop: heading?.trim() || copy?.trim()
            ? "var(--fyd-space-section-major, 96px)"
            : "var(--fyd-space-section-minor, 48px)",
          paddingBottom: heading?.trim() || copy?.trim()
            ? "var(--fyd-space-section-major, 96px)"
            : "var(--fyd-space-section-minor, 48px)",
          animationDelay: delay ? `${delay}ms` : undefined,
          // Deterministic section identity: lets view transitions keep a
          // section's identity across generated pages when MORPH is active.
          viewTransitionName:
            sectionId && morph ? sectionViewTransitionName(sectionId) : undefined,
        } as CSSProperties
      }
    >
      {(heading || copy) && (
        // RENDER-WIRE: lane-7 Reveal on the section entrance (content item,
        // not the section container: the container comment above explains
        // why the section itself never takes a transform entrance).
        <Reveal variant="rise" index={motionIndex ?? 0}>
          {heading && (
            <h2 className="fyd-type-h2" style={{ color: theme.ink }}>
              {heading}
            </h2>
          )}
          {copy && (
            <p
              className="fyd-type-lead text-accent"
              style={{
                marginTop: "var(--fyd-space-stack-description, 1.25rem)",
                // Polish lane (2026-09-26): the measure never exceeds the
                // column; long tokens wrap anywhere instead of overflowing.
                maxWidth: "min(var(--fyd-measure, 65ch), 100%)",
              }}
            >
              {copy}
            </p>
          )}
        </Reveal>
      )}
      <div style={{ marginTop: "var(--fyd-space-stack-section, 2.5rem)" }}>
        {children}
      </div>
    </section>
  );
}


/**
 * RENDER-WIRE hero trust row: licence and service area resolved from the
 * graph, never invented. Licence comes from an explicit allowlist of
 * licence-shaped owner fields through the binding verifier; service area
 * from public location objects related to the business. Either half may be
 * absent; the row renders only when at least one half verifies.
 */
const HERO_LICENCE_FIELDS = [
  "claimed_license",
  "license",
  "licence",
  "license_number",
  "licence_number",
  "contractor_license",
] as const;

function heroLicenceLine(ctx: RenderContext, o: PingObject): string | null {
  for (const field of HERO_LICENCE_FIELDS) {
    const v = boundField(ctx, o, field);
    if (v) return v;
  }
  return null;
}

function heroServiceAreaLine(ctx: RenderContext, o: PingObject): string | null {
  const names: string[] = [];
  for (const r of ctx.graph.relationships) {
    if (r.subject !== o.id && r.object !== o.id) continue;
    const otherId = r.subject === o.id ? r.object : r.subject;
    const other = ctx.graph.objects.find((x) => x.id === otherId);
    if (!other || other.visibility !== "public") continue;
    if (schemaRole(other.schema) !== "location") continue;
    const t = boundTitle(ctx, other);
    if (t && !names.includes(t)) names.push(t);
    if (names.length >= 3) break;
  }
  return names.length > 0 ? names.join(", ") : null;
}

function Hero({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const heading = presentation.heading ?? boundTitle(ctx, o);
  const copy = presentation.copy ?? boundDescription(ctx, o);
  // Contact discoverability: a tenant with no website still gets a
  // one-glance primary action. The phone is a ContactMethod projection:
  // binding-verified (same verifier as the Contact section) and gated
  // through the safe-link gate. Polish lane (2026-09-26): the button is a
  // direct tel: anchor (the FydContactLink primary action), never behind a
  // disclosure. An unverifiable or unsafe number renders no button.
  const phoneMethod = contactMethod(ctx, o, "phone", correctionFor(o, "phone"));
  // Media is threaded through RenderContext from the server render seam;
  // the renderer never selects it. Null keeps the honest typographic hero.
  const hero = ctx.heroMedia ?? null;
  const character = characterOf(theme);
  // Evidence-backed trust row: licence + service area from the graph.
  const trustLine =
    [heroLicenceLine(ctx, o), heroServiceAreaLine(ctx, o)]
      .filter((part): part is string => Boolean(part))
      .join(" \u00b7 ") || null;
  // CONTACT-owned Hero heading below: the business-identity view-transition
  // name (businessViewTransitionName(ctx.spec.ownerObjectId), stamped only
  // when MORPH is active) belongs on the h1 in the CONTACT lane's merge
  // so both lanes do not edit the same block. This lane's compose-motion.ts
  // already provides the deterministic helper.

  // The photographic block is a client boundary (HeroSection, "use client"):
  // image load failures are browser-only events, and this module is imported
  // by server-only routes, so the error latch cannot live here. The server
  // resolves all hero data; HeroSection owns only the failure state, and the
  // text/actions block below stays server-rendered children.
  return (
    <HeroSection
      hero={hero}
      theme={theme}
      character={character}
      viewerKind={ctx.viewerKind}
    >
      {/* RENDER-WIRE: the container, min-height, and photographic layers
          belong to HeroSection (full-bleed). Children are the copy column
          only: badge, fluid display h1, lead copy, CTAs, trust row, doorway. */}
      <div className="max-w-3xl">
        <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} theme={theme} tone="onDark" ctx={ctx} />
        <h1 className="fyd-type-display mt-4 break-words text-background">
          {heading}
        </h1>
        {copy ? (
          <p
            className="fyd-type-lead mt-4 text-background/80"
            // Polish lane (2026-09-26): the lead must never escape the copy
            // column on narrow viewports (mid-word clip at 390px). The
            // 65ch measure is capped to the column, and long tokens wrap
            // anywhere instead of overflowing.
            style={{ maxWidth: "min(var(--fyd-measure, 65ch), 100%)", overflowWrap: "anywhere" }}
          >
            {copy}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {/* CONTACT-DISCOVERABILITY: the business phone is a hero CTA on
              every viewport. phoneMethod is a binding-verified ContactMethod
              (the same verifier as the Contact section), safety-gated through
              contactMethodFor: an unverifiable or unsafe number is null and
              the caller renders nothing. The old ISSUE-3 logic coupled the
              dial affordance to website.kind === "safe" and hid it behind
              md:hidden, which is exactly why no phone was visible in the
              desktop hero. Decoupled here: any tenant with a binding-verified
              phone method gets the button, website or not. Polish lane
              (2026-09-26): the phone renders as a direct tel: anchor (the
              FydContactLink primary action), never behind a disclosure. */}
          {phoneMethod ? (
            <FydContactLink method={phoneMethod} theme={theme} variant="button" />
          ) : null}
          {/* Polish lane (2026-09-26): no "Visit website" on the visitor
              surface. A visitor is already ON the business site; a
              self-referential off-site hop is not a conversion action.
              Conversion intent (estimate/quote/call) belongs to the CTA
              section when the graph backs it. */}
          <a
            href="#ask"
            className="rounded border px-6 py-3 font-semibold text-background"
            style={{ borderColor: theme.accent, borderRadius: theme.radius === "full" ? 9999 : 8 }}
          >
            Ask FYD
          </a>
        </div>
        {/* OBJECT IDENTITY (mobile-objects lane): the business is a real
            object, not just copy. The doorway opens the compact object
            experience (identity, fields, relationships, evidence, Ask FYD)
            through the site client's /o/ interception. It renders on
            EVERY viewport: desktop previously had no business doorway at
            all, and the mobile projection must never be a static
            projection while desktop owns the object model. */}
        {trustLine ? (
          <p className="fyd-type-meta mt-6 text-background/70">{trustLine}</p>
        ) : null}
        <div className="mt-6">
          <ObjectDoorway o={o} theme={theme} ctx={ctx} tone="onDark" />
        </div>
      </div>
    </HeroSection>
  );
}
function BusinessSummary({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const title = boundTitle(ctx, o);
  return (
    <SectionShell
      theme={theme}
      sectionId={section.id}
      heading={presentation.heading ?? (title ? "About " + title : undefined)}
      copy={presentation.copy ?? boundDescription(ctx, o)}
    >
      <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} ctx={ctx} />
      {/* Mobile in-flow composition: the business object itself as a
          tappable card in the page flow (<768px). Desktop keeps the
          prose summary unchanged. */}
      <MobileInFlowObjects
        objects={objects}
        theme={theme}
        ctx={ctx}
        testId="inflow-business"
      />
    </SectionShell>
  );
}

/**
 * Card grid: every card renders from the object graph through
 * FydObjectCard (hover lift, tap-to-detail, FYD mark affordance on
 * canonical types, visual cover where the graph has media, relationship
 * microcopy). Never hand content.
 */
function CardGrid({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {objects.map((o, i) => (
        <FydObjectCard key={o.id} o={o} theme={theme} ctx={ctx} index={i} />
      ))}
    </div>
  );
}

/**
 * Mobile in-flow object composition (2026-09-24, Phase 2 of the
 * BUILDER-BRUTAL-CEO-HARVEST directive).
 *
 * On viewports below the md breakpoint (<768px) the margin object layer
 * is intentionally absent (2026-09-23 product direction, binding: no
 * object bucket, no floating tab, no drawer on mobile). This component is
 * its replacement: the section's own objects rendered as tappable
 * FydObjectCards directly in the page flow, at the section's
 * data-object-anchor spot.
 *
 * - Visually integrated: the same FydObjectCard the Services section
 *   uses on every viewport; theme-driven, no floating chrome.
 * - Tappable: each card title links to /o/<id>, which the site client
 *   intercepts into the rich ObjectOverlay (scroll-preserving).
 * - Document-anchored: plain in-flow DOM, so the cards scroll WITH the
 *   page. Never position:fixed, never viewport-sticky.
 * - Desktop untouched: md:hidden keeps >=768px pixel-identical.
 * - The ?objectDebug=1 gate on MarginObjectLayer is NOT touched; this
 *   is the replacement composition, not a gate removal.
 *
 * Generic: descriptors only. Zero customer-specific code.
 */
function MobileInFlowObjects({
  objects,
  theme,
  ctx,
  kickerFor,
  testId,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
  /** Optional per-object kicker line under the title (e.g. a post date). */
  kickerFor?: (o: PingObject) => string | undefined;
  /** Test hook for the mobile composition block. */
  testId: string;
}) {
  // Data-absent rule (polish lane, 2026-09-26): objects without usable
  // public content (unbound / narration / handle-fragment titles) are
  // filtered from the row individually, matching the planner's query
  // narrowing. An all-unusable block renders nothing, never empty cards.
  const usable = objects.filter((o) => isUsablePublicTitle(boundTitle(ctx, o), o.schema));
  if (usable.length === 0) return null;
  return (
    <div
      className="mt-6 md:hidden"
      data-testid={testId}
      data-inflow-composition="mobile"
    >
      <div className="grid grid-cols-1 gap-4">
        {usable.map((o, i) => (
          <FydObjectCard
            key={o.id}
            o={o}
            theme={theme}
            ctx={ctx}
            index={i}
            kicker={kickerFor ? kickerFor(o) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * RENDER-WIRE service rows: for 5+ services the card grid becomes a wall,
 * so the list goes typographic. Hairline rows, one object per row, each
 * row opens the object detail through the title link.
 */
function ServiceRows({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <ul className="divide-y divide-border-soft">
      {objects.map((o) => {
        const title = boundTitle(ctx, o);
        const description = boundDescription(ctx, o);
        return (
          <li key={o.id} className="py-5" data-motion="enter">
            <h3 className="fyd-type-h3" style={{ color: theme.ink }}>
              <a
                href={`/o/${encodeURIComponent(o.id)}`}
                className="fyd-object-title-link"
              >
                {title}
              </a>
            </h3>
            {description ? (
              <p className="fyd-type-body mt-1 text-accent">{description}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * RENDER-WIRE service feature: one offering with a real photograph becomes
 * a split editorial block (photo + identity + copy). No photo, no feature:
 * the caller falls back to the card grid, never to a decorative frame.
 */
function ServiceFeature({
  o,
  theme,
  ctx,
}: {
  o: PingObject;
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  const title = boundTitle(ctx, o);
  const description = boundDescription(ctx, o);
  const media = photographicMedia(ctx.objectMedia?.[o.id]);
  const detailHref = `/o/${encodeURIComponent(o.id)}`;
  return (
    <article
      className="grid gap-6 md:grid-cols-2 md:items-center"
      data-motion="enter"
    >
      <div
        className="overflow-hidden"
        style={{ borderRadius: theme.radius === "none" ? 0 : 12 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media!.src}
          alt={media!.alt ?? title}
          className="aspect-[4/3] h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div>
        <h3 className="fyd-type-h3" style={{ color: theme.ink }}>
          <a href={detailHref} className="fyd-object-title-link">
            {title}
          </a>
        </h3>
        {description ? (
          <p className="fyd-type-body mt-3 text-accent">{description}</p>
        ) : null}
      </div>
    </article>
  );
}

function ServicesSection(props: SectionProps) {
  const { section, objects, presentation, theme, ctx, motionIndex } = props;
  const featured = presentation.featuredIds?.length
    ? objects.filter((o) => presentation.featuredIds!.includes(o.id))
    : objects;
  if (!sectionHasUsableContent(ctx, featured)) return null;
  // RENDER-WIRE: the planner stamps compositionVariant (feature/grid/rows);
  // absent stays the card grid. Feature requires a real photograph on the
  // featured object, otherwise the grid is the honest fallback.
  const variant = presentation.compositionVariant ?? "grid";
  const featureObject =
    variant === "feature" && featured.length === 1
      ? photographicMedia(ctx.objectMedia?.[featured[0].id])
        ? featured[0]
        : null
      : null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Services"} copy={presentation.copy}>
      {variant === "rows" ? (
        <ServiceRows objects={featured} theme={theme} ctx={ctx} />
      ) : featureObject ? (
        <ServiceFeature o={featureObject} theme={theme} ctx={ctx} />
      ) : (
        <CardGrid objects={featured} theme={theme} ctx={ctx} />
      )}
    </SectionShell>
  );
}

function ProductsSection(props: SectionProps) {
  const { section, objects, presentation, theme, ctx, motionIndex } = props;
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Products"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function LocationsSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  return (
    <SectionShell
      theme={theme}
      sectionId={section.id}
      heading={presentation.heading ?? "Where we work"}
      copy={presentation.copy}
    >
      <ul className="hidden flex-wrap gap-2 md:flex">
        {objects.map((o) => {
          const title = boundTitle(ctx, o);
          const detailHref = `/o/${encodeURIComponent(o.id)}`;
          return title ? (
            <li key={o.id}>
              <a
                href={detailHref}
                data-fyd-object-id={o.id}
                className="inline-block rounded-full border border-border-soft px-4 py-2 text-sm transition-colors hover:bg-stone-100"
                style={{ color: theme.ink }}
                role="button"
                tabIndex={0}
                aria-expanded="false"
                aria-label={title}
              >
                {title}
              </a>
            </li>
          ) : null;
        })}
      </ul>
      <div className="mt-3">
        <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} ctx={ctx} />
      </div>
      {/* Mobile in-flow composition: Location object cards in the page
          flow (<768px), replacing the pill list. Desktop unchanged. */}
      <MobileInFlowObjects
        objects={objects}
        theme={theme}
        ctx={ctx}
        testId="inflow-locations"
      />
    </SectionShell>
  );
}

function PeopleSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  // Structural differentiation from the graph: when person objects have
  // photographic media, they render as a people strip (portrait-led);
  // otherwise the honest card grid. No hand-built sections either way.
  const anyMedia = objects.some((o) => photographicMedia(ctx.objectMedia?.[o.id]));
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "The people"} copy={presentation.copy}>
      {anyMedia ? (
        <div
          className="fyd-people-strip fyd-people-rail flex gap-5 overflow-x-auto pb-3"
          data-motion="enter"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {objects.map((o, i) => {
            const title = boundTitle(ctx, o);
            const role = boundField(ctx, o, "role");
            const media = photographicMedia(ctx.objectMedia?.[o.id]);
            const reln = relationshipLine(ctx, o);
            const detailHref = `/o/${encodeURIComponent(o.id)}`;
            const initials = (title ?? "?")
              .trim()
              .split(/\s+/)
              .map((w) => w[0] ?? "")
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <article
                key={o.id}
                className="fyd-card w-44 shrink-0 text-center"
                data-motion="enter"
                data-motion-index={i}
                style={{ position: "relative", scrollSnapAlign: "start" }}
              >
                {media ? (
                  <img
                    src={media.src}
                    alt={media.alt}
                    width={media.width}
                    height={media.height}
                    loading="lazy"
                    sizes="176px"
                    style={{
                      width: "7rem",
                      height: "7rem",
                      objectFit: "cover",
                      borderRadius: "9999px",
                      display: "block",
                      margin: "0 auto",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: "7rem",
                      height: "7rem",
                      borderRadius: "9999px",
                      margin: "0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: theme.surface,
                      border: `2px solid ${theme.accent}`,
                      color: theme.ink,
                      fontFamily: theme.fontDisplay,
                      fontSize: "1.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {initials}
                  </div>
                )}
                {title ? (
                  <h3 className="mt-3 text-base font-semibold" style={{ color: theme.ink }}>
                    <a href={detailHref} style={{ color: "inherit", textDecoration: "none" }}>
                      {title}
                    </a>
                  </h3>
                ) : null}
                {role ? (
                  <p className="mt-0.5 text-sm font-medium" style={{ color: theme.accent }}>
                    {role}
                  </p>
                ) : null}
                {reln ? (
                  <p className="fyd-reln mt-1 text-xs" style={{ color: theme.ink }}>
                    {reln}
                  </p>
                ) : null}
                {affordanceEligible(o) ? (
                  <ObjectAffordance
                    viewerKind={ctx.viewerKind}
                    objectId={o.id}
                    title={title ?? null}
                    kindLabel={friendlySchemaLabel(o.schema)}
                    schemaId={o.schema}
                    controllerId={o.controllerId}
                    evidenceLine={ctx.viewerKind !== "engineer" ? sourceLabelFor(o) : affordanceEvidenceLine(o)}
                    theme={theme}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {objects.map((o, i) => (
            <FydObjectCard
              key={o.id}
              o={o}
              theme={theme}
              ctx={ctx}
              index={i}
              kicker={boundField(ctx, o, "role")}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

/**
 * RENDER-WIRE post prose grid: the desktop editorial treatment for posts
 * (date kicker, title, description). Extracted unchanged from PostsSection
 * so the grid composition variant reuses the exact same markup.
 */
function PostProseGrid({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2">
      {objects.map((o) => {
        const date = boundField(ctx, o, "date");
        const title = boundTitle(ctx, o);
        const description = boundDescription(ctx, o);
        return (
          <article
            key={o.id}
            className="border border-border-soft p-5"
            style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            {date ? (
              <p className="text-xs uppercase tracking-wide text-accent">{date}</p>
            ) : null}
            {title ? (
              <h3 className="mt-1 text-lg font-semibold" style={{ color: theme.ink }}>
                {title}
              </h3>
            ) : null}
            {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
            <div className="mt-3">
              <ClaimBadge objects={[o]} viewerKind={ctx.viewerKind} ctx={ctx} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * RENDER-WIRE archive list: the dense typographic treatment for 13+
 * objects. One hairline row per object (date, title link), no cards.
 */
function ArchiveList({
  objects,
  theme,
  ctx,
  dateField,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
  /** Optional date-shaped field shown as the row kicker. */
  dateField?: string;
}) {
  // RENDER-WIRE: with a date field the rows group under deterministic
  // month headings (an archive browses by time); without one the flat
  // row list renders exactly as before.
  const groups = new Map<string, PingObject[]>();
  for (const o of objects) {
    const raw = dateField ? boundField(ctx, o, dateField) : null;
    const label = raw ? observedMonthYear(raw) : "";
    const key = label || "undated";
    const rows = groups.get(key);
    if (rows) rows.push(o);
    else groups.set(key, [o]);
  }
  const showMonths = dateField != null;
  return (
    <>
      {Array.from(groups.entries()).map(([key, rows]) => (
        <div key={key}>
          {showMonths ? (
            <h3 className="fyd-type-h3 mt-8" style={{ color: theme.ink }}>
              {key === "undated" ? "Undated" : key}
            </h3>
          ) : null}
          <ul className="divide-y divide-border-soft">
            {rows.map((o) => {
              const date = dateField ? boundField(ctx, o, dateField) : null;
              const title = boundTitle(ctx, o);
              return (
                <li key={o.id} className="flex items-baseline gap-4 py-3" data-motion="enter">
                  {date ? (
                    <span className="fyd-type-meta shrink-0 text-accent">{date}</span>
                  ) : null}
                  <a
                    href={`/o/${encodeURIComponent(o.id)}`}
                    className="fyd-object-title-link fyd-type-body"
                    style={{ color: theme.ink }}
                  >
                    {title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function PostsSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  // Sorting uses the raw value (deterministic ordering input, never rendered).
  const sorted = objects.slice().sort((a, b) =>
    fieldOf(b, "date").localeCompare(fieldOf(a, "date")),
  );
  // RENDER-WIRE: the planner stamps compositionVariant (list/grid/archive);
  // absent keeps the prose grid. The mobile in-flow projection stays on the
  // grid variant exactly as before.
  const variant = presentation.compositionVariant ?? "grid";
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Latest"} copy={presentation.copy}>
      {variant === "list" ? (
        <FeedList objects={sorted} theme={theme} ctx={ctx} />
      ) : variant === "archive" ? (
        <ArchiveList objects={sorted} theme={theme} ctx={ctx} dateField="date" />
      ) : (
        <>
          <PostProseGrid objects={sorted} theme={theme} ctx={ctx} />
          {/* Mobile in-flow composition: post/project object cards in the
              page flow (<768px), tappable into the object overlay. The post
              date rides as the card kicker. Desktop keeps the prose grid. */}
          <MobileInFlowObjects
            objects={sorted}
            theme={theme}
            ctx={ctx}
            kickerFor={(o) => boundField(ctx, o, "date")}
            testId="inflow-posts"
          />
        </>
      )}
    </SectionShell>
  );
}

function ObjectGridSection(props: SectionProps) {
  const { section, objects, presentation, theme, ctx, motionIndex } = props;
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Browse"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function FeedList({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {objects.map((o, i) => {
        const title = boundTitle(ctx, o);
        const description = boundDescription(ctx, o);
        // Visual feed item only where the graph has media for the object.
        const media = photographicMedia(ctx.objectMedia?.[o.id]);
        // ANTI-FLATTENING (mobile-objects lane): every feed item carries
        // its object doorway. The title links to /o/<id> (intercepted into
        // the ObjectOverlay by the site client) and canonical types get
        // the FYD-mark affordance. FeedList previously rendered objects
        // as static prose on every viewport: identity without interaction.
        const detailHref = `/o/${encodeURIComponent(o.id)}`;
        return (
          <li
            key={o.id}
            className="border border-border-soft p-5"
            data-motion="enter"
            data-motion-index={i}
            style={{ position: "relative", background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            <div className="flex gap-4">
              {media ? (
                <img
                  src={media.src}
                  alt={media.alt}
                  width={media.width}
                  height={media.height}
                  loading="lazy"
                  sizes="112px"
                  style={{
                    width: "7rem",
                    height: "7rem",
                    objectFit: "cover",
                    borderRadius: theme.radius === "none" ? 0 : 8,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {title ? (
                    <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
                      <a
                        href={detailHref}
                        data-fyd-object-id={o.id}
                        style={{ color: "inherit", textDecoration: "none" }}
                        role="button"
                        tabIndex={0}
                        aria-expanded="false"
                        aria-label={title}
                      >
                        {title}
                      </a>
                    </h3>
                  ) : null}
                  <span className="text-xs uppercase tracking-wide text-accent">{friendlySchemaLabel(o.schema)}</span>
                </div>
                {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
                <div className="mt-3">
                  <ClaimBadge objects={[o]} viewerKind={ctx.viewerKind} ctx={ctx} />
                </div>
              </div>
            </div>
            {affordanceEligible(o) ? (
              <ObjectAffordance
                viewerKind={ctx.viewerKind}
                objectId={o.id}
                title={title ?? null}
                kindLabel={friendlySchemaLabel(o.schema)}
                schemaId={o.schema}
                controllerId={o.controllerId}
                evidenceLine={ctx.viewerKind !== "engineer" ? sourceLabelFor(o) : affordanceEvidenceLine(o)}
                theme={theme}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ObjectFeedSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  const variant = presentation.compositionVariant ?? "list";
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Explore"} copy={presentation.copy}>
      {variant === "grid" ? (
        <CardGrid objects={objects} theme={theme} ctx={ctx} />
      ) : variant === "archive" ? (
        <ArchiveList objects={objects} theme={theme} ctx={ctx} dateField="date" />
      ) : (
        <FeedList objects={objects} theme={theme} ctx={ctx} />
      )}
    </SectionShell>
  );
}

function RecentObjectsSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  const sorted = objects
    .slice()
    .sort((a, b) =>
      a.updatedAt !== b.updatedAt
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.id < b.id
          ? -1
          : 1,
    );
  // RENDER-WIRE: list stays the default; the planner may stamp grid or
  // archive for richer or denser object sets.
  const variant = presentation.compositionVariant ?? "list";
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Recent"} copy={presentation.copy}>
      {variant === "grid" ? (
        <CardGrid objects={sorted} theme={theme} ctx={ctx} />
      ) : variant === "archive" ? (
        <ArchiveList objects={sorted} theme={theme} ctx={ctx} dateField="date" />
      ) : (
        <FeedList objects={sorted} theme={theme} ctx={ctx} />
      )}
    </SectionShell>
  );
}

function ContactSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  // Owner-corrected fields are read with the owner_authored
  // classification: the displayed value is owner state (durable, survives
  // re-ingestion), not a website statement. The correction record stays
  // on the object so the section can name both values honestly.
  const phoneCorrection = correctionFor(o, "phone");
  const emailCorrection = correctionFor(o, "email");
  // ContactMethod projections: binding-verified, safety-gated. Each
  // renders as the FydContactLink primary action: a direct tel:/mailto:
  // anchor beside a secondary provenance disclosure. An unverifiable or
  // unsafe number/email is not a method: no output.
  const phoneMethod = contactMethod(ctx, o, "phone", phoneCorrection);
  const emailMethod = contactMethod(ctx, o, "email", emailCorrection);
  const website = safeWebsite(ctx);
  const showWebsite = website.kind === "safe";
  if (!phoneMethod && !emailMethod && !showWebsite) return null;
  // Polish lane (2026-09-26): the contact section is a composed block,
  // not floating raw links. Field labels name each row; the website link
  // shows its host (never a bare href); the heading is always visible
  // (empty-string presentation headings must not erase it).
  const heading = presentation.heading?.trim() ? presentation.heading : "Contact";
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={heading} copy={presentation.copy}>
      <dl className="grid gap-4 text-base sm:grid-cols-3">
        {phoneMethod ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-accent">Phone</dt>
            <dd className="mt-1">
              <FydContactLink method={phoneMethod} theme={theme} variant="row" />
              {phoneCorrection ? <CorrectionNote correction={phoneCorrection} theme={theme} /> : null}
            </dd>
          </div>
        ) : null}
        {emailMethod ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-accent">Email</dt>
            <dd className="mt-1">
              <FydContactLink method={emailMethod} theme={theme} variant="row" />
              {emailCorrection ? <CorrectionNote correction={emailCorrection} theme={theme} /> : null}
            </dd>
          </div>
        ) : null}
        {showWebsite && website.kind === "safe" ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-accent">Website</dt>
            <dd className="mt-1">
              <a href={website.href} className="underline inline-block min-h-[44px] py-2" style={{ color: theme.ink }}>
                {hostOf(website.href)}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3">
        <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} ctx={ctx} />
      </div>
    </SectionShell>
  );
}

function LinksSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const raw = o.fields["socials"];
  const socials: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  // Fail closed: social links only render when the socials binding verifies.
  const socialsBound = boundField(ctx, o, "socials") !== undefined;
  const website = safeWebsite(ctx);
  const links: { href: string; label: string }[] = [];
  if (website.kind === "safe") links.push({ href: website.href, label: hostOf(website.href) });
  if (socialsBound) {
    for (const url of socials) {
      const link = resolveSafeLink(url, "navigate");
      if (link.kind === "safe") links.push({ href: link.href, label: hostOf(link.href) });
    }
  }
  if (links.length === 0) return null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Find us"} copy={presentation.copy}>
      <ul className="flex flex-wrap gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-block border px-4 py-2 text-sm underline"
              style={{ borderColor: theme.accent, color: theme.ink, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SocialProofSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const fieldName = o.fields["reviews"] !== undefined ? "reviews" : "testimonials";
  const raw = o.fields[fieldName];
  const items: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  // Fail closed: quotes only render when the field binding verifies.
  if (items.length === 0 || boundField(ctx, o, fieldName) === undefined) return null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "What people say"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((t, i) => (
          <blockquote
            key={i}
            className="border-l-4 p-4 italic"
            style={{ borderColor: theme.accent, background: theme.surface }}
          >
            {t}
            <div className="mt-2 not-italic">
              <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} ctx={ctx} />
            </div>
          </blockquote>
        ))}
      </div>
    </SectionShell>
  );
}

/**
 * Graph-backed conversion intent (polish lane, 2026-09-26): the primary
 * CTA prefers a legitimate estimate/quote destination when the graph backs
 * one. Candidates are public service objects carrying a service_href field
 * (a DIRECT_FACT from website ingestion) whose path names an estimate or
 * quote intent. The href is read through the binding verifier and resolved
 * with resolveSafeLink ("navigate") against the business's verified website
 * as the explicit base URL: relative links only resolve with that safe
 * base, absolute links must be safe on their own, and anything else yields
 * no intent. Selection is deterministic (id order, first qualifying
 * candidate). Nothing is invented: no qualifying href in the graph means
 * no estimate CTA, and the label names the intent found in the URL, never
 * a claim about the business. Generic: no tenant, URL, or customer
 * conditions.
 */
function estimateIntentFor(
  ctx: RenderContext,
): { href: string; label: string } | null {
  const base = boundWebsite(ctx);
  if (!base) return null;
  const candidates = ctx.graph.objects
    .filter(
      (c) =>
        c.visibility === "public" &&
        c.schema === "ping.social.service@1" &&
        typeof c.fields["service_href"] === "string" &&
        (c.fields["service_href"] as string).trim() !== "",
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of candidates) {
    const raw = boundField(ctx, c, "service_href");
    if (raw === undefined) continue;
    let path: string;
    try {
      path = new URL(raw, base).pathname.toLowerCase();
    } catch {
      continue;
    }
    const intent = /estimate/.test(path)
      ? "estimate"
      : /quote/.test(path)
        ? "quote"
        : null;
    if (!intent) continue;
    const safe = resolveSafeLink(raw, "navigate", { baseUrl: base });
    if (safe.kind !== "safe") continue;
    return {
      href: safe.href,
      label: intent === "quote" ? "Request a quote" : "Get an estimate",
    };
  }
  return null;
}

function CTASection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  // Polish lane (2026-09-26): the visitor CTA is the business's real
  // conversion intent, never a self-referential "Visit website". Selection
  // prefers a graph-backed estimate/quote intent when the graph backs one,
  // then the binding-verified phone method, then the verified email method;
  // when the graph backs no conversion intent the slot is omitted entirely
  // (nothing invented). The contact link renders the direct tel:/mailto:
  // anchor (FydContactLink primary action) beside its secondary provenance
  // disclosure.
  const estimate = o ? estimateIntentFor(ctx) : null;
  const conversion = estimate
    ? null
    : o
      ? (contactMethod(ctx, o, "phone", correctionFor(o, "phone")) ??
         contactMethod(ctx, o, "email", correctionFor(o, "email")))
      : null;
  return (
    <section className="w-full px-4 py-12 sm:px-6" style={{ background: theme.surface }}>
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: theme.fontDisplay, color: theme.ink }}>
          {presentation.heading ?? "Start the conversation"}
        </h2>
        {presentation.copy && <p className="mt-2 text-accent">{presentation.copy}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {estimate ? (
            <a
              href={estimate.href}
              className="inline-block rounded px-6 py-3 font-semibold"
              style={{ background: theme.accent, color: theme.accentForeground, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              {estimate.label}
            </a>
          ) : conversion ? (
            <FydContactLink method={conversion} theme={theme} variant="button" />
          ) : null}
          <a
            href="#ask"
            className="rounded border px-6 py-3 font-semibold"
            style={{ borderColor: theme.accent, color: theme.ink, borderRadius: theme.radius === "full" ? 9999 : 8 }}
          >
            Ask FYD
          </a>
        </div>
      </div>
    </section>
  );
}

function IdentityCardSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const title = boundTitle(ctx, o);
  const description = boundDescription(ctx, o);
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading} copy={presentation.copy}>
      <div
        className="flex flex-col gap-2 border border-border-soft p-6 sm:flex-row sm:items-center sm:justify-between"
        style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 12 }}
      >
        <div>
          {title ? (
            <h3 className="text-xl font-semibold" style={{ color: theme.ink }}>
              {title}
            </h3>
          ) : null}
          {description ? <p className="mt-1 text-sm text-accent">{description}</p> : null}
        </div>
        <ClaimBadge objects={objects} viewerKind={ctx.viewerKind} ctx={ctx} />
      </div>
    </SectionShell>
  );
}

function AskFYDSection({ presentation, theme, ctx }: SectionProps) {
  const ownerName = boundOwnerTitle(ctx);
  return (
    <section id="ask" className="w-full px-4 py-12 sm:px-6" style={{ background: theme.ink }}>
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-2xl font-semibold text-background sm:text-3xl"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {presentation.heading ?? "Ask FYD about " + ownerName}
        </h2>
        <p className="mt-2 text-background/70">
          {presentation.copy ?? "Questions go to Ask FYD. Answers come only from this site's published information, with sources shown."}
        </p>
        <div className="text-left">
          <AskFydWidget siteId={ctx.siteId} theme={theme} />
        </div>
      </div>
    </section>
  );
}

/**
 * Owner name for the Ask FYD heading. The heading is a label, not a factual
 * claim, so it falls back to "this business" when the title binding does
 * not verify; the fallback is honest precisely because it claims nothing.
 */
function boundOwnerTitle(ctx: RenderContext): string {
  const owner = ctx.graph.objects.find((o) => o.id === ctx.spec.ownerObjectId);
  if (!owner) return "this business";
  return boundTitle(ctx, owner) ?? "this business";
}

/**
 * ObjectRail section: the generic margin capability as an inline section.
 * Features the richest public non-owner object through the existing
 * ObjectCircle doorway over the honest pingObjectToView adapter; presence
 * mode auto lets geometry decide rail vs drawer from the theme token.
 *
 * Binding gate: the featured identity is a factual claim, so candidates are
 * restricted to objects whose title binding verifies (boundTitle resolves
 * through the presentation-binding verifier). The view and the summary use
 * the verified values, never the raw object fields. An unbound object never
 * features: no binding, no factual output.
 */
function ObjectRailSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  const bound = objects.filter((o) => boundTitle(ctx, o) !== undefined);
  // Data-absent rule (polish lane, 2026-09-26): a rail whose objects all
  // lack usable public content (handle-fragment titles, narration
  // descriptions) renders nothing.
  if (!sectionHasUsableContent(ctx, bound)) return null;
  const featured = richestObject(bound, ctx.spec.ownerObjectId);
  if (!featured) return null;
  const name = boundTitle(ctx, featured) as string;
  const summary = boundDescription(ctx, featured);
  const featuredView = pingObjectToView({ ...featured, title: name, description: summary ?? "" });
  const presence: ObjectPresence = {
    mode: "auto",
    objects: [featured.id],
    rules: { collapseBelow: "lg" },
  };
  const cards = (
    <div className="space-y-3">
      <ObjectCircle view={featuredView} />
      {summary?.trim() ? (
        <p className="text-sm leading-relaxed" style={{ color: theme.ink }}>
          {summary.trim()}
        </p>
      ) : null}
      <p className="text-xs" style={{ color: theme.ink, opacity: 0.6 }}>
        {featuredView.provenance.label}
      </p>
    </div>
  );
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <ObjectRail
        cards={cards}
        presence={presence}
        theme={theme}
        // Public-projection purity (polish lane, 2026-09-26): no invented
        // fallback heading. No heading means no presentation heading: the
        // rail renders the featured object, not a "Featured object" pill.
        heading={presentation.heading}
      />
    </section>
  );
}

function GenericObjectCardSection({ section, objects, presentation, theme, ctx, motionIndex }: SectionProps) {
  // Data-absent rule (polish lane, 2026-09-26): a section whose objects
  // all lack usable public content (unbound / narration / handle-
  // fragment titles) renders nothing, never a row of empty cards.
  if (!sectionHasUsableContent(ctx, objects)) return null;
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "More"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

/**
 * Gallery eligibility: the section renders if and only if the render
 * context carries gallery media. Missing data means the section does not
 * exist. Exported for the generator lane and tests.
 */
export function galleryEligible(ctx: RenderContext): boolean {
  return (ctx.galleryMedia?.length ?? 0) > 0;
}

/**
 * Contextual provenance for a gallery photo: the generic WhyThis
 * drill-down fed ONLY with the media's own provenance fields, mirroring
 * the hero photo treatment. No invented copy.
 */
function GalleryMediaWhyThis({
  media,
  viewerKind,
}: {
  media: DisplayMedia;
  viewerKind?: RenderViewerKind;
}) {
  // LANE-8: the media provenance drill-down is engineer material.
  if (viewerKind !== "engineer") return null;
  const steps: EvidenceStep[] = [];
  if (media.sourceUrl) {
    steps.push({ step: "Photo source", detail: media.sourceUrl, state: "observed" });
  }
  if (media.rightsBasis) {
    // Policy inference, not an observation: classifyRights is a URL
    // heuristic with no authorization evidence (QA-TRUTH F-002).
    steps.push({ step: "Rights basis", detail: media.rightsBasis, state: "inferred" });
  }
  if (media.observedAt) {
    steps.push({ step: "Observed", detail: media.observedAt, state: "observed" });
  }
  if (media.digest) {
    steps.push({
      step: "Content digest",
      detail: media.digest.slice(0, 16) + "...",
      state: "inferred",
    });
  }
  return (
    <WhyThis
      claim={media.alt || "Gallery photo"}
      steps={steps}
      viewerKind={viewerKind}
    />
  );
}

/**
 * Gallery: the media-rich section, generated from evidence-backed media
 * objects threaded through the render context (never hand-picked).
 * Lazy-loads below-fold media with explicit width/height (no CLS) and
 * responsive sizes. Renders nothing when fewer than MIN_GALLERY_ASSETS
 * gallery assets exist: a thin frame is a liability, not a gallery.
 */
/**
 * RENDER-WIRE explicit before/after pairs.
 *
 * The current media contract (FydMediaObject / DisplayMedia) exposes no
 * pair identifier, so this function does NOT infer pairs from proximity,
 * alt text, capture order, or any other heuristic: an inferred pairing
 * would fabricate a transformation claim. Pairing activates only when the
 * contract gains an explicit pair field; until then every asset renders
 * as a single. The BeforeAfter rendering path below stays wired and is
 * covered by tests with explicit pairs.
 */
export function pairBeforeAfter(media: DisplayMedia[]): {
  pairs: { before: DisplayMedia; after: DisplayMedia }[];
  singles: DisplayMedia[];
} {
  return { pairs: [], singles: media.slice() };
}

function GallerySection({ section, presentation, theme, ctx, motionIndex }: SectionProps) {
  const media = ctx.galleryMedia ?? [];
  // RENDER-WIRE: below the lane-4 asset minimum the gallery is a liability:
  // the section drops instead of rendering a thin frame.
  if (media.length < MIN_GALLERY_ASSETS) return null;
  const motion = motionTokensForTheme(theme);
  const intent = designIntentForTheme(theme);
  const variant = presentation.compositionVariant ?? "grid";
  const { pairs, singles } = pairBeforeAfter(media);
  const radius = theme.radius === "none" ? 0 : 8;
  const figure = (m: DisplayMedia, i: number, masonry: boolean) => (
    <figure
      key={m.id}
      data-motion="enter"
      data-motion-index={i}
      className={masonry ? "mb-3 break-inside-avoid" : undefined}
      style={{ animationDelay: staggerDelayMs(i, motion) ? `${staggerDelayMs(i, motion)}ms` : undefined }}
    >
      <img
        src={m.src}
        alt={m.alt}
        width={m.width}
        height={m.height}
        loading="lazy"
        sizes="(max-width: 640px) 50vw, 33vw"
        style={
          masonry
            ? { width: "100%", height: "auto", display: "block", borderRadius: radius }
            : {
                width: "100%",
                height: "auto",
                display: "block",
                aspectRatio: "4 / 3",
                objectFit: "cover",
                borderRadius: radius,
              }
        }
      />
      <figcaption className="mt-1">
        <GalleryMediaWhyThis media={m} viewerKind={ctx.viewerKind} />
      </figcaption>
    </figure>
  );
  return (
    <SectionShell theme={theme} sectionId={section.id} motionIndex={motionIndex} heading={presentation.heading ?? "Gallery"} copy={presentation.copy}>
      {pairs.length > 0 ? (
        <div className="mb-6 grid gap-6" data-fyd-before-after-set>
          {pairs.map(({ before, after }) => (
            <div
              key={before.id + ":" + after.id}
              style={{ borderRadius: radius, overflow: "hidden" }}
            >
              <BeforeAfter
                before={{ src: before.src, alt: before.alt }}
                after={{ src: after.src, alt: after.alt }}
              />
            </div>
          ))}
        </div>
      ) : null}
      {variant === "masonry" ? (
        <div
          className="fyd-gallery-masonry columns-2 gap-3 sm:columns-3"
          data-media-treatment={intent.mediaTreatment}
        >
          {singles.map((m, i) => figure(m, i, true))}
        </div>
      ) : (
        <div
          className="fyd-gallery-grid grid grid-cols-2 gap-3 sm:grid-cols-3"
          data-media-treatment={intent.mediaTreatment}
        >
          {singles.map((m, i) => figure(m, i, false))}
        </div>
      )}
    </SectionShell>
  );
}

export function renderSection(section: FYDSection, ctx: RenderContext, motionIndex = 0): ReactNode {
  const def = getComponentDef(section.component);
  if (!def) return null;
  if (section.presentation.hidden) return null;
  const ordered = applyObjectOrder(
    resolveQuery(section.query, ctx.graph, ctx.spec.ownerObjectId),
    section.presentation.objectOrder,
  );
  // Owner-approved presentation intent: object deactivation after ordering.
  // Pure and deterministic; unknown ids are ignored, never rendered.
  // The exclusion set is site-wide: an object the owner hid in ANY section
  // is excluded from every public projection surface (including the Featured
  // Object rail and mobile in-flow composition), never only its home section.
  const objects = applyHiddenObjects(ordered, siteDeactivatedObjectIds(ctx.spec));
  if (def.requiresData && objects.length === 0) return null;
  const props: SectionProps = {
    section,
    objects,
    presentation: section.presentation,
    theme: ctx.spec.themeTokens,
    ctx,
    motionIndex,
  };
  switch (section.component) {
    case "Hero":
      return <Hero key={section.id} {...props} />;
    case "BusinessSummary":
      return <BusinessSummary key={section.id} {...props} />;
    case "Services":
      return <ServicesSection key={section.id} {...props} />;
    case "Products":
      return <ProductsSection key={section.id} {...props} />;
    case "Locations":
      return <LocationsSection key={section.id} {...props} />;
    case "People":
      return <PeopleSection key={section.id} {...props} />;
    case "Posts":
      return <PostsSection key={section.id} {...props} />;
    case "ObjectGrid":
      return <ObjectGridSection key={section.id} {...props} />;
    case "ObjectFeed":
      return <ObjectFeedSection key={section.id} {...props} />;
    case "RecentObjects":
      return <RecentObjectsSection key={section.id} {...props} />;
    case "Contact":
      return <ContactSection key={section.id} {...props} />;
    case "Links":
      return <LinksSection key={section.id} {...props} />;
    case "SocialProof":
      return <SocialProofSection key={section.id} {...props} />;
    case "CTA":
      return <CTASection key={section.id} {...props} />;
    case "IdentityCard":
      return <IdentityCardSection key={section.id} {...props} />;
    case "AskFYD":
      return <AskFYDSection key={section.id} {...props} />;
    case "ObjectRail":
      return <ObjectRailSection key={section.id} {...props} />;
    case "Gallery":
      return <GallerySection key={section.id} {...props} />;
    case "GenericObjectCard":
    default:
      return <GenericObjectCardSection key={section.id} {...props} />;
  }
}

export function SitePageView({ page, ctx }: { page: FYDPage; ctx: RenderContext }) {
  return (
    <>
      <FydMotionStyles theme={ctx.spec.themeTokens} />
      {page.sections.map((s, i) => renderSection(s, ctx, i))}
    </>
  );
}
