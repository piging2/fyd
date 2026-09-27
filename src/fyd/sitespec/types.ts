/**
 * FYD SiteSpec: the declarative product of the generative object-site compiler.
 *
 * Law: the spec is DATA, never generated JSX. The renderer turns
 * (SiteSpec + ObjectGraph + ViewerContext) into UI. A spec is portable,
 * diffable, validatable, and deterministic: the same graph always yields
 * the same spec.
 *
 * Shape harvested from src/lib/website-structure.ts (Route -> Page ->
 * Section -> Component) and generalized: pages hold sections, sections name
 * a registered component and declare HOW to fetch their objects (query),
 * never the objects themselves.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { TypeVoice, TypeVoiceSignals } from "../theme/type-scale";

/** The graph the generator reasons over: browser-safe objects plus relationships. */
export interface ObjectGraph {
  objects: PingObject[];
  relationships: PingRelationship[];
}

/** Who is viewing the rendered site. Kept minimal on purpose. */
export interface ViewerContext {
  viewerId: string | null;
  displayName: string | null;
}

/** How a section resolves its objects from the graph. Deterministic. */
export type FYDQuery =
  | { kind: "owner" }
  | {
      kind: "related";
      from: string;
      /** Primary predicate, human-readable. */
      predicate: string;
      /**
       * Full predicate match set in canonical order. Resolution matches any
       * of these, so one query compiles both the social vocabulary
       * (provides) and the knowledge vocabulary (offers). Defaults to
       * [predicate] when absent.
       */
      predicates?: string[];
      schema?: string;
      schemas?: string[];
      limit?: number;
    }
  | { kind: "all"; schema?: string; schemas?: string[]; limit?: number }
  | { kind: "reference"; objectIds: string[] }
  | { kind: "static" };

/** Presentation overrides. Copy edits arrive here as PROPOSED changes only. */
export interface FYDPresentation {
  heading?: string;
  copy?: string;
  featuredIds?: string[];
  hidden?: boolean;
  /**
   * Owner-approved object display order (object ids). The renderer lists
   * these ids first, in this order; objects not listed follow in their
   * default query order. Never a fact: only the display sequence.
   */
  objectOrder?: string[];
  /**
   * Owner-approved hidden object ids within this section. The renderer
   * filters these ids out after resolving the section query (and after
   * applying objectOrder). Never a fact: only a display decision.
   */
  hiddenObjectIds?: string[];
  /**
   * Composition variant selected by the builder's composition compiler
   * from measured graph signals (object/media counts). Presentation
   * only, never a fact. Vocabulary is per component family:
   * Services: "feature" | "grid" | "rows"; Gallery: "grid" | "masonry";
   * Posts / RecentObjects / ObjectFeed: "list" | "grid" | "archive".
   * Absent: the renderer's default for the component.
   */
  compositionVariant?: string;
}

export interface FYDSection {
  /** Deterministic id: pageSlug + ":" + component + ":" + index. */
  id: string;
  /** Component registry name, e.g. "Hero", "Services". */
  component: string;
  query: FYDQuery;
  presentation: FYDPresentation;
}

export interface FYDPage {
  /** URL slug, e.g. "home", "about", "services", "explore". */
  slug: string;
  title: string;
  navLabel: string;
  sections: FYDSection[];
}

export interface FYDNavItem {
  label: string;
  pageSlug: string;
}

/**
 * Basic design tokens. Structured values only, no drag and drop.
 * Tokens re-skin the whole generated site without touching the spec.
 *
 * v1 fields (accent, accentForeground, surface, ink, radius, fontDisplay,
 * fontBody) are frozen. The builder composition lane (fyd/builder-composition)
 * extends the set additively; every new group is optional so specs written
 * before this change validate and render unchanged.
 */
export interface FYDTypeScale {
  /** Base font size in px. */
  base: number;
  /** Modular ratio between type steps. */
  ratio: number;
}

/** Spacing scale in px, named steps. */
export interface FYDSpacingScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/** Extended color roles beyond the v1 accent/surface/ink triple. */
export interface FYDColorSystem {
  muted?: string;
  border?: string;
  success?: string;
  warning?: string;
  danger?: string;
}

/** Surface variants for cards, sheets, overlays. */
export interface FYDSurfaces {
  card?: string;
  overlay?: string;
  sheet?: string;
}

/** Shadow tokens. */
export interface FYDShadows {
  sm?: string;
  md?: string;
  lg?: string;
}

/** Layout tokens: content measure and rail width. */
export interface FYDLayoutTokens {
  /** Max content width in px. */
  contentMaxWidth?: number;
  /** Rail width in px on wide viewports. */
  railWidth?: number;
}

/**
 * Named viewport breakpoints in px. Placement geometry reads these through
 * resolveCollapseBreakpoint; no placement logic hardcodes px.
 */
export interface FYDBreakpoints {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/** Media treatment tokens. */
export interface FYDMediaTokens {
  treatment?: "documentary" | "polished" | "schematic";
  aspectRatio?: string;
}

/** Motion tokens: durations in ms; reduced-motion disables animation. */
export interface FYDMotionTokens {
  durationMs?: number;
  easing?: string;
}

/**
 * CANONICAL MOTION PROFILE (Nolan, 2026-09-22 FYD grill, BINDING).
 *
 * The one shared motion type the whole design system uses. The compose
 * lane imports this definition; the shape below is the contract:
 * - motionIntensity: NONE collapses decorative motion (the
 *   reduced-motion equivalent: nothing depends on animation);
 *   SUBTLE is the default product motion (quiet, quick, no theater);
 *   EXPRESSIVE is reserved for hero/celebration moments.
 * - entrance: how a surface first appears (FADE_RISE, REVEAL, SCALE).
 * - objectTransition: how the Circle becomes the card and the card
 *   becomes Ask FYD (MORPH = shared-identity transform; CROSSFADE =
 *   the reduced-motion-safe swap).
 * - stagger: sequencing of grouped children (action grids, suggestion
 *   chips): NONE, TIGHT, RELAXED.
 */
export interface MotionTokens {
  motionIntensity: "NONE" | "SUBTLE" | "EXPRESSIVE";
  entrance: "FADE_RISE" | "REVEAL" | "SCALE";
  objectTransition: "MORPH" | "CROSSFADE";
  stagger: "NONE" | "TIGHT" | "RELAXED";
}

/**
 * Layout character: a PRESENTATION hint, never business truth. Chosen by
 * the composing strategy/archetype and stamped onto the spec's theme
 * tokens (SiteSpec), owner-overridable through the normal token-override
 * path. The same components read it; no fact ever changes with it.
 */
export type FYDLayoutCharacter =
  | "EDITORIAL"
  | "CRAFT"
  | "TECHNICAL"
  | "RETAIL"
  | "PROFESSIONAL"
  | "CREATOR";

/**
 * ViewportCapabilities: the device's composition-relevant capabilities.
 *
 * ONE SEMANTIC SITESPEC (mobile architecture, binding): the renderer never
 * branches on a DesktopSiteSpec/MobileSiteSpec. Composition inputs are
 * SiteSpec + ObjectGraph + ViewerContext + ViewportCapabilities, and the
 * SAME object projects differently per device: a Service is a rich
 * horizontal card on desktop, a compact object tile on mobile.
 *
 * SSR honesty: the server cannot know the viewport, so the server renders
 * the compact (mobile-first) baseline and the client provider
 * (fyd/components/viewport.tsx) resolves the real capabilities after
 * mount. Layout projection is CSS-driven from the data-viewport /
 * data-pointer attributes the provider stamps on <html> (no hydration
 * mismatch: the DOM is identical, only the projection changes);
 * ViewportCapabilities in JS is for BEHAVIORAL choices (touch-first
 * interactions, rails vs grids, sticky actions).
 *
 * Width classes: xs <480, sm 480-767, md 768-1023, lg 1024-1439, xl 1440+.
 * The CSS breakpoints in the renderer use the same cut points.
 */
export type ViewportWidthClass = "xs" | "sm" | "md" | "lg" | "xl";

export interface ViewportCapabilities {
  widthClass: ViewportWidthClass;
  /** Coarse (touch) or fine (mouse/trackpad) primary pointer. */
  pointer: "coarse" | "fine";
  /** Whether the primary input can hover. Never gate functionality on it. */
  hover: boolean;
  /** Viewer asked for reduced motion (or intensity NONE was composed). */
  reducedMotion: boolean;
  /** CSS safe-area insets in px; zeros where unsupported/unknown. */
  safeArea: { top: number; right: number; bottom: number; left: number };
}

/**
 * DESIGN SYSTEM COMPILER (mobile architecture, binding): semantic design
 * intent lives on the SiteSpec; a deterministic token map compiles it to
 * presentation. The LLM/agent proposes INTENT patches (density, radius,
 * type scale, spacing rhythm, surface depth, motion intensity, media
 * treatment, content width, object emphasis); the owner approves; the
 * compiler renders. No arbitrary CSS generation, ever.
 *
 * layoutCharacter is the seed of this compiler: strategy/archetype picks
 * the character, tokenOverrides let the owner adjust, and
 * CHARACTER_PRESENTATION (renderer) is the deterministic map. The fields
 * below grow the seed toward full intent without changing the mechanism.
 */
export interface FYDDesignIntent {
  /** Content density: compact tiles vs comfortable cards. */
  density?: "compact" | "comfortable";
  /** Max content width in px for the center column. */
  contentWidthPx?: number;
  /** Media treatment: contained cards vs edge-to-edge moments on mobile. */
  mediaTreatment?: "contained" | "edge-to-edge";
  /** How hard objects push for attention in the composition. */
  objectEmphasis?: "quiet" | "balanced" | "prominent";
}

export interface FYDThemeTokens {
  accent: string;
  accentForeground: string;
  surface: string;
  ink: string;
  radius: "none" | "sm" | "md" | "lg" | "full";
  fontDisplay: string;
  fontBody: string;
  typography?: FYDTypeScale;
  spacing?: FYDSpacingScale;
  colors?: FYDColorSystem;
  surfaces?: FYDSurfaces;
  shadows?: FYDShadows;
  layout?: FYDLayoutTokens;
  breakpoints?: FYDBreakpoints;
  media?: FYDMediaTokens;
  motion?: FYDMotionTokens;
  /**
   * Presentation character hint (strategy-chosen, owner-overridable).
   * Changes presentation tokens only, never facts.
   */
  layoutCharacter?: FYDLayoutCharacter;
  /**
   * Motion semantics for the customer surface. SiteSpec chooses the
   * semantics; the renderer owns the implementation. Absent: restrained
   * defaults (SUBTLE / FADE_RISE / MORPH / TIGHT), always collapsed by
   * prefers-reduced-motion.
   */
  motionTokens?: MotionTokens;
  /**
   * Semantic design intent for the design-system compiler (mobile
   * architecture). Optional and additive: absent intent falls back to
   * the layoutCharacter presentation map. Owner-overridable through the
   * normal token-override path.
   */
  designIntent?: FYDDesignIntent;
  /**
   * Lane-6 type-voice extension, folded in (RENDER-WIRE integration).
   * Additive and optional: specs written before this change validate and
   * render unchanged. The voice selects the editorial vs utilitarian
   * type scale; signals are graph-derived and name-free.
   */
  typeVoice?: TypeVoice;
  typeVoiceSignals?: TypeVoiceSignals;
}

export const DEFAULT_FYD_THEME: FYDThemeTokens = {
  accent: "#C9A227",
  accentForeground: "#1c1917",
  surface: "#FFFFFF",
  ink: "#232033",
  radius: "md",
  fontDisplay: "Playfair Display, Georgia, serif",
  fontBody: "Geist, system-ui, sans-serif",
};

/** Where the spec's claims come from. Website claims are never verified fact. */
export interface FYDSpecProvenance {
  source: "website-ingestion";
  claimKind: "website_statement";
  /** Acceptance-sequence window of the ingestion events, when known. */
  eventSequences?: [number, number];
  note: string;
}

export interface FYDSiteSpec {
  kind: "fyd.sitespec@1";
  /** The business (or root) object this site is generated for. */
  ownerObjectId: string;
  version: 1;
  generator: {
    name: "fyd-site-generator";
    version: string;
    generatedAt: string;
  };
  themeTokens: FYDThemeTokens;
  navigation: FYDNavItem[];
  pages: FYDPage[];
  provenance: FYDSpecProvenance;
  /**
   * Builder composition extensions (all optional, backward compatible):
   * status/revision: draft-vs-published lifecycle with bounded revision
   * history; archetype: which composition profile composed this spec;
   * objectPresence: the generic margin/rail layout capability.
   */
  status?: FYDSpecStatus;
  revision?: number;
  archetype?: FYDSiteArchetype;
  objectPresence?: ObjectPresence;
}

/** A typed validation finding. Shape harvested from src/lib/findings.ts. */
export interface FYDFinding {
  severity: "error" | "warning" | "info";
  authority: "fyd.sitespec.validator";
  resourceId: string;
  path: string;
  message: string;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Builder composition extensions (fyd/builder-composition, 2026-09-21).
// Additive and optional: pre-existing specs validate and render unchanged.
// ---------------------------------------------------------------------------

/** Lifecycle of a generated spec: operator-authored draft vs published. */
export type FYDSpecStatus = "draft" | "published";

/** Which composition profile composed this spec. */
export type FYDSiteArchetype = "KNOWLEDGE" | "TRADES" | "TECHNICAL_ENTERPRISE";

/** ObjectPresence mode: explicit placement or geometry-decided. */
export type ObjectPresenceMode =
  | "auto"
  | "rail"
  | "drawer"
  | "hidden"
  /**
   * "edge": Nolan 2026-09-25 presence-law name for "rail" (explicit
   * alias). Edge presence = layered near the composition edge, anchored
   * to a page region, scrolls away with it. Additive: pre-existing
   * specs validate and render unchanged.
   */
  | "edge";

/**
 * ObjectPlacementMode: the three formal FYD object-presence modes
 * (Nolan 2026-09-25 object-presence direction, standing product law).
 * Single authority for the mode vocabulary; the spatial runtime aliases
 * this type (see PresentationPresetMode in fyd/spatial/slot-manager.ts).
 *
 * - "embedded": the object participates naturally in the page
 *   composition. Best default.
 * - "edge": visually layered near the composition edge, anchored to a
 *   specific page region; scrolls away with that region. The primary
 *   FYD enhancement mode for existing websites.
 * - "persistent": viewport-fixed or sticky utility. RARE: requires an
 *   actual persistent use case. Never for decorative discovery objects.
 */
export type ObjectPlacementMode = "embedded" | "edge" | "persistent";

/**
 * Declarative per-object placement (Nolan 2026-09-25 presence law).
 * All fields optional: absent fields fall back to geometry and ranking.
 * Placement belongs to SiteSpec/presentation; the underlying PING object
 * never knows pixel positions.
 */
export interface ObjectPlacement {
  /** Semantic anchor key (e.g. "hero") this object's presence belongs to. */
  anchorKey?: string;
  /** Preferred presence mode for this object. */
  mode?: ObjectPlacementMode;
  /** Preferred margin side for edge presence. */
  preferredSide?: "left" | "right";
  /** Resting glyph diameter class in px (desktop). */
  restSize?: number;
  /** Lower wins ties when objects compete for one rail. */
  priority?: number;
  /** What may surface this object (open vocabulary; e.g. "auto", "tap"). */
  activation?: string;
}

/**
 * ObjectPresence: the generic margin/rail layout capability.
 *
 * Placement law: center = canonical customer content, untouched. Margins =
 * contextual intelligence when safe space exists. Narrow viewports collapse
 * the rail to a drawer/sheet, never displacing content. In "auto" mode the
 * rail-vs-drawer decision comes from geometry: the collapseBelow breakpoint
 * key is resolved through the spec theme tokens via resolveCollapseBreakpoint.
 */
export interface ObjectPresence {
  mode: ObjectPresenceMode;
  /** Contextual object ids eligible for the margin/rail, deterministic order. */
  objects: string[];
  /**
   * Optional per-object declarative placements, keyed by object id.
   * Additive: specs without placements behave exactly as before.
   */
  placements?: Record<string, ObjectPlacement>;
  rules: {
    /** Breakpoint key (see FYDBreakpoints); the rail collapses to a drawer below it. */
    collapseBelow: string;
  };
}

/** Default breakpoint table when a spec theme tokens carry none. */
export const DEFAULT_FYD_BREAKPOINTS: FYDBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

/**
 * Resolve a collapseBelow breakpoint key to px. Unknown keys fail closed to
 * the "lg" default (1024): the rail still collapses, at standard geometry.
 * Never throws.
 */
export function resolveCollapseBreakpoint(theme: FYDThemeTokens, key: string): number {
  const table = theme.breakpoints ?? DEFAULT_FYD_BREAKPOINTS;
  const v: number | undefined =
    key === "sm" ? table.sm
    : key === "md" ? table.md
    : key === "lg" ? table.lg
    : key === "xl" ? table.xl
    : undefined;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : DEFAULT_FYD_BREAKPOINTS.lg;
}
