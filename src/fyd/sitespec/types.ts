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
  | { kind: "all"; schema?: string; limit?: number }
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
 */
export interface FYDThemeTokens {
  accent: string;
  accentForeground: string;
  surface: string;
  ink: string;
  radius: "none" | "sm" | "md" | "lg" | "full";
  fontDisplay: string;
  fontBody: string;
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
}

/** A typed validation finding. Shape harvested from src/lib/findings.ts. */
export interface FYDFinding {
  severity: "error" | "warning" | "info";
  authority: "fyd.sitespec.validator";
  resourceId: string;
  path: string;
  message: string;
}
