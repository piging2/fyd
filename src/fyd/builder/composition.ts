/**
 * Composition transform: the composition compiler's structural stage.
 *
 * composeSections is a PURE function over the generator's data-driven
 * sections: it selects a composition variant per Services/Gallery/Posts
 * section from measured graph signals (count, media) and drops Gallery
 * sections below the asset minimum. It never invents sections, never binds
 * objects, never changes facts: it annotates presentation only.
 *
 * Variant vocabulary (stamped on presentation.compositionVariant, read by
 * the renderer lane):
 *   Services: "feature" (one headline offering with real media),
 *             "grid" (<= 4), "rows" (>= 5)
 *   Gallery:  "grid" (3..11 assets), "masonry" (>= 12); dropped below 3
 *   Posts / RecentObjects / ObjectFeed: "list" (<= 4), "grid" (5..12),
 *             "archive" (> 12)
 *
 * Determinism: variant selection is a pure function of (component, bound
 * count, signal counts). Notes are fixed strings of counts, emitted in
 * page/section order. The caller supplies the query inspector so this
 * module never touches the graph directly.
 */

import type { FYDPage, FYDQuery } from "../sitespec/types";
import type { GraphSignals } from "./signals";

export const COMPOSITION_VERSION = "fyd-composition@1";

/** Gallery sections below this asset count are dropped, not rendered empty. */
export const MIN_GALLERY_ASSETS = 3;

/** What the transform needs to know about a section's bound objects. */
export interface SectionInspection {
  count: number;
  /** Bound object ids with real photography, in id order. */
  photoObjectIds: string[];
}

export interface ComposedSections {
  pages: FYDPage[];
  /** Fixed-order audit notes (drops and variant assignments). */
  notes: string[];
}

const POST_COMPONENTS = new Set(["Posts", "RecentObjects", "ObjectFeed"]);

function servicesVariant(
  count: number,
  photoObjectIds: string[],
  galleryAssets: number,
): string {
  // One headline offering with real media gets the feature treatment
  // (corpus: service_count == 1 AND media richness fires the feature
  // variant). Otherwise the count decides: grid at <= 4, rows at >= 5.
  if (count === 1 && (photoObjectIds.length >= 1 || galleryAssets >= 2)) {
    return "feature";
  }
  return count >= 5 ? "rows" : "grid";
}

function postsVariant(count: number): string {
  if (count <= 4) return "list";
  return count <= 12 ? "grid" : "archive";
}

function galleryVariant(assets: number): string {
  return assets >= 12 ? "masonry" : "grid";
}

/**
 * Pure section transform. pages are the generator's sections (pre-planner
 * ids); inspect resolves a section query to its bound count and
 * photography. Returns composed pages plus audit notes.
 */
export function composeSections(
  pages: FYDPage[],
  signals: GraphSignals,
  inspect: (query: FYDQuery) => SectionInspection,
): ComposedSections {
  const notes: string[] = [];
  const assets = signals.counts.galleryAssets;

  const composedPages = pages.map((page) => {
    const sections = [];
    for (const section of page.sections) {
      // Gallery below the asset minimum is dropped: fewer than three
      // real images composes as intentional typography-led layout, never
      // as empty image slots (corpus rule).
      if (section.component === "Gallery" && assets < MIN_GALLERY_ASSETS) {
        notes.push(
          "section \"" +
            section.id +
            "\" dropped: " +
            assets +
            " gallery assets below the " +
            MIN_GALLERY_ASSETS +
            " minimum",
        );
        continue;
      }
      let variant: string | null = null;
      if (section.component === "Services") {
        const info = inspect(section.query);
        variant = servicesVariant(info.count, info.photoObjectIds, assets);
        notes.push(
          "section \"" +
            section.id +
            "\" composition variant \"" +
            variant +
            "\": " +
            info.count +
            " bound services",
        );
      } else if (section.component === "Gallery") {
        variant = galleryVariant(assets);
        notes.push(
          "section \"" +
            section.id +
            "\" composition variant \"" +
            variant +
            "\": " +
            assets +
            " gallery assets",
        );
      } else if (POST_COMPONENTS.has(section.component)) {
        const info = inspect(section.query);
        variant = postsVariant(info.count);
        notes.push(
          "section \"" +
            section.id +
            "\" composition variant \"" +
            variant +
            "\": " +
            info.count +
            " bound objects",
        );
      }
      sections.push(
        variant === null
          ? section
          : {
              ...section,
              presentation: { ...section.presentation, compositionVariant: variant },
            },
      );
    }
    return { ...page, sections };
  });

  return { pages: composedPages, notes };
}
