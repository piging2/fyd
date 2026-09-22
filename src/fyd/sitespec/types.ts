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
export type ObjectPresenceMode = "auto" | "rail" | "drawer" | "hidden";

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
