/**
 * TRACK C (website builder harvest), 2026-09-28.
 * Typed SitePatch vocabulary: the 10-op convergence surface.
 *
 * Convergence verdicts (search-before-write, per the 2026-09-26 program):
 * the base tree at HEAD 0264d517 already owns most of this surface via
 * Lane D (src/fyd/customize/) and LANE-OWNER (src/fyd/owner-mode/). This
 * module does NOT re-implement that machinery. It names the 10 required
 * operations as one typed vocabulary and maps each op onto the canonical
 * implementation:
 *
 *   ADOPT  - the op is an existing SiteIntent kind; this module delegates.
 *   ADAPT  - the op extends an existing kind or needs new pure apply logic;
 *            the extension lives here additively, never as a fork.
 *   REFUSE - the op is typed and validated, but the CAPABILITY stage
 *            refuses it for a stated, frozen reason. Refusal is a verdict,
 *            not a gap.
 *
 * Layer law (frozen, from src/fyd/customize/types.ts): customization
 * operates on PRESENTATION INTENT only. FACTS (the object graph) are never
 * written by this pipeline; the DESIGN SYSTEM (theme tokens, component
 * registry) is not customizable through it. Ops that would cross those
 * boundaries are refused, never coerced.
 *
 * No em dashes in user-facing strings (standing rule).
 */

import type { FYDQuery } from "../sitespec/types";

/**
 * The 10 typed SitePatch operations. Data only; every op carries the
 * addressing it needs (page slug, section id) so the pipeline never
 * guesses a target.
 */
export type SitePatchOp =
  | { kind: "MOVE_SECTION"; pageSlug: string; sectionId: string; toIndex: number }
  | {
      kind: "ADD_SECTION";
      pageSlug: string;
      component: string;
      query: FYDQuery;
      heading?: string;
      copy?: string;
      atIndex?: number;
    }
  | { kind: "REMOVE_SECTION"; pageSlug: string; sectionId: string }
  | { kind: "SET_VISIBILITY"; pageSlug: string; sectionId: string; hidden: boolean }
  | { kind: "SET_FEATURED_OBJECT"; pageSlug: string; sectionId: string; objectIds: string[] }
  | { kind: "SET_DESIGN_TOKEN"; token: string; value: string }
  | { kind: "SET_PRESENTATION_COPY"; pageSlug: string; sectionId: string; heading?: string; copy?: string }
  | { kind: "ADD_PAGE"; slug: string; title: string; navLabel: string }
  | { kind: "REMOVE_PAGE"; slug: string }
  | { kind: "CHANGE_QUERY"; pageSlug: string; sectionId: string; query: FYDQuery };

export type OpDisposition = "ADOPT" | "ADAPT" | "REFUSE";

export interface OpMapping {
  disposition: OpDisposition;
  /** Canonical implementation this op routes to. */
  canonical: string;
  /** Why this mapping, in one line. */
  note: string;
}

/**
 * Convergence mapping for the 10 ops. This table is the reconciliation
 * record: nothing here duplicates an existing implementation.
 */
export const SITE_PATCH_OP_MAP: Record<SitePatchOp["kind"], OpMapping> = {
  MOVE_SECTION: {
    disposition: "ADOPT",
    canonical: "src/fyd/proceduralize/patch.ts SiteIntent 'reorder_section' (proposeSitePatch / applySitePatch)",
    note: "Exact semantic match; promote_first resolves to this kind.",
  },
  ADD_SECTION: {
    disposition: "ADAPT",
    canonical: "src/fyd/sitepatch/pipeline.ts applyExtendedSitePatch (additive extension of applySitePatch)",
    note: "No existing kind adds a section; pure additive apply logic lives here.",
  },
  REMOVE_SECTION: {
    disposition: "ADAPT",
    canonical: "src/fyd/sitepatch/pipeline.ts applyExtendedSitePatch (additive extension of applySitePatch)",
    note: "Existing kinds only hide sections (toggle_section). Hard removal is a new, explicit op.",
  },
  SET_VISIBILITY: {
    disposition: "ADOPT",
    canonical: "src/fyd/proceduralize/patch.ts SiteIntent 'toggle_section' + src/fyd/owner-mode/visibility-policy.ts",
    note: "Section visibility is the toggle_section kind; fact visibility goes through visibility-policy.",
  },
  SET_FEATURED_OBJECT: {
    disposition: "ADOPT",
    canonical: "src/fyd/proceduralize/patch.ts SiteIntent 'set_featured'",
    note: "Exact semantic match; feature_object resolves to this kind.",
  },
  SET_DESIGN_TOKEN: {
    disposition: "REFUSE",
    canonical: "frozen Lane D layer law (src/fyd/customize/types.ts): DESIGN SYSTEM not customizable through this pipeline",
    note: "Typed and validated, then refused at CAPABILITY. Never coerced into a theme change.",
  },
  SET_PRESENTATION_COPY: {
    disposition: "ADOPT",
    canonical: "src/fyd/proceduralize/patch.ts SiteIntent 'edit_copy'",
    note: "Exact semantic match; copy edits are proposed changes until the digest is approved.",
  },
  ADD_PAGE: {
    disposition: "ADAPT",
    canonical: "src/fyd/sitepatch/pipeline.ts applyExtendedSitePatch (additive extension of applySitePatch)",
    note: "No existing kind adds a page; pure additive apply logic lives here.",
  },
  REMOVE_PAGE: {
    disposition: "ADAPT",
    canonical: "src/fyd/sitepatch/pipeline.ts applyExtendedSitePatch (additive extension of applySitePatch)",
    note: "No existing kind removes a page; pure additive apply logic lives here.",
  },
  CHANGE_QUERY: {
    disposition: "ADAPT",
    canonical: "src/fyd/sitepatch/pipeline.ts applyExtendedSitePatch (additive extension of applySitePatch)",
    note: "No existing kind rewrites a section query; pure additive apply logic lives here.",
  },
};

export function opMappingOf(kind: SitePatchOp["kind"]): OpMapping {
  return SITE_PATCH_OP_MAP[kind];
}
