/**
 * FYD Social shared site render pipeline. SERVER ONLY.
 *
 * The single compile seam for every /sites/* demo page: resolve the site's
 * VERIFIED PUBLIC projection (Q-C-01), compile the base SiteSpec from the
 * projected object graph, apply the approved presentation-intent layer OVER
 * the compiled spec, then validate. Facts (graph) and the design system
 * (theme) are never touched by the intent layer.
 *
 * Zero per-site conditionals: pages pass only their site id. A new site
 * gets presentation-intent application for free by calling this seam;
 * no page may compile or render a spec that bypasses the intent layer.
 *
 * The graph handed to pages is the verified public projection's graph:
 * public objects and endpoint-safe relationships only, owner-hidden fields
 * already removed at the boundary. There is no separate "publicGraph"
 * step: the boundary IS the privacy step, applied once, before compile.
 * Declared unresolved field conflicts (FYD-Q1) are withheld from that
 * graph before compile, exactly as the ask lane withholds them.
 *
 * RENDER-WIRE: /sites/* converges onto planSite (the same planner the
 * /build route uses) instead of the bare data-driven generator, so
 * composition variants (feature/grid/rows, list/grid/archive, grid/masonry)
 * reach the public pages through one pipeline, not two. planSite calls
 * generateSiteSpec WITHOUT a site id, so the media-manifest-backed Gallery
 * emission cannot happen inside the planner (planner.ts is a forbidden
 * file): the seam inserts the Gallery section itself, replicating exactly
 * what the generator would have emitted (static query, generator position
 * after People, planner id restamp) and what composeSections would have
 * stamped (compositionVariant per the asset-count vocabulary, dropped
 * below MIN_GALLERY_ASSETS). This is one pipeline with a documented seam
 * fill, not a second planner and not a renderer-invented section.
 */

import {
  getPingObjectGraph,
  getVerifiedPublicProjection,
} from "@/fyd/data/ping-object-source";
import { applyPresentationIntent } from "@/fyd/customize/apply-layer";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import { getSiteBundle } from "@/fyd/media/site-bundle";
import {
  isUnresolvedConflict,
  suppressConflictedFields,
  type AskFieldConflict,
} from "@/fyd/ask/field-conflicts";
import type {
  FYDFinding,
  FYDSection,
  FYDSiteSpec,
  ObjectGraph,
} from "@/fyd/sitespec/types";
// RENDER-WIRE convergence imports: the builder planner, the composition
// vocabulary threshold, the graph-derived archetype vector, and the
// media-selection chain (the planner's media input + the seam's gallery
// assets + the manifest focal point for the hero).
import { planSite } from "@/fyd/builder/planner";
import { MIN_GALLERY_ASSETS } from "@/fyd/builder/composition";
import { vectorForSite } from "@/fyd/builder/site-vectors";
import {
  galleryMediaFor,
  heroMediaFor,
  listObjectMedia,
  readPipelineManifest,
  type DisplayMedia,
} from "@/fyd/media/select";
import { SCHEMA_ROLES } from "@/fyd/sitespec/schema-roles";
import type { CompositionMediaInput } from "@/fyd/builder/signals";

export interface CompiledPublicSite {
  /** The verified public projection (branded; carries the receipt). */
  projection: VerifiedPublicProjection;
  /**
   * The projected public graph (facts): public objects and endpoint-safe
   * active relationships only. Safe to serialize to the client.
   */
  graph: ObjectGraph;
  /** Compiled spec with the approved presentation intent applied. */
  spec: FYDSiteSpec;
  findings: FYDFinding[];
  renderable: boolean;
  /**
   * FYD-Q1 defense-in-depth (LANE-CLAIM D2): contact fields withheld
   * from the compiled spec and the returned graph because of declared
   * unresolved field conflicts. Inert in production today (no bundle
   * declares conflicts): empty unless a conflict is declared. Pages
   * render CONFLICT_BEING_VERIFIED_COPY for these fields.
   */
  withheldConflictedFields: { objectId: string; field: string }[];
  /**
   * RENDER-WIRE: hero media with the manifest focal point attached (the
   * hero component reads it for object-position). Null when the owner has
   * no acquired hero-grade media: the honest typographic hero.
   */
  heroMedia: DisplayMedia | null;
  /**
   * RENDER-WIRE: acquired gallery assets for the owner, resolved once at
   * this seam so the Gallery insertion gate and the render context share
   * one asset list. Empty when the owner has no gallery assets.
   */
  galleryAssets: DisplayMedia[];
  /**
   * Polish lane (2026-09-26): the owner's logo-role media for the visitor
   * header wordmark, resolved once at this seam. Null when the manifest
   * has no logo for the owner: the wordmark renders as text. Never a
   * hero/gallery asset: a logo is brand identity, not photography.
   */
  ownerLogo: DisplayMedia | null;
}

/**
 * The owner object id the media-selection chain resolves against: the
 * public business object, lowest id wins ties. Mirrors the generator's
 * owner pick exactly (proceduralize/generator.ts).
 */
function ownerObjectIdForMedia(graph: ObjectGraph): string {
  const businesses = graph.objects
    .filter(
      (o) =>
        SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public",
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return businesses[0]?.id ?? "";
}

/**
 * The planner's measured media input: gallery asset count, hero presence,
 * and the ids of public non-business objects carrying real photography
 * (a logo is brand identity, not photography). In id order, per the
 * CompositionMediaInput contract.
 */
function compositionMediaInput(
  siteId: string,
  graph: ObjectGraph,
  ownerId: string,
): CompositionMediaInput {
  const galleryAssets = galleryMediaFor(siteId, graph, ownerId).length;
  return {
    galleryAssets,
    heroAsset: galleryAssets > 0,
    photographicObjectIds: graph.objects
      .filter(
        (o) =>
          o.visibility === "public" &&
          !SCHEMA_ROLES.business.includes(o.schema) &&
          listObjectMedia(siteId, graph, o.id).some((m) => m.role !== "logo"),
      )
      .map((o) => o.id)
      .sort(),
  };
}

/**
 * Gallery insertion for the planSite convergence (see the module doc).
 * Replicates the generator's Gallery emission: a static-query Gallery
 * section at the generator's position (after People, else before
 * RecentObjects/Contact, else appended), stamped with the composition
 * vocabulary variant (grid 3..11 assets, masonry >= 12, per
 * builder/composition.ts), gated on MIN_GALLERY_ASSETS. Ids are restamped
 * in the planner's slug:Component:index scheme so the page's section ids
 * stay deterministic.
 */
function insertGallerySection(
  spec: FYDSiteSpec,
  galleryAssetCount: number,
): FYDSiteSpec {
  if (galleryAssetCount < MIN_GALLERY_ASSETS) return spec;
  // The masonry threshold lives in builder/composition.ts's galleryVariant
  // (unexported); this is the same vocabulary value, cited here.
  const GALLERY_MASONRY_THRESHOLD = 12;
  const pages = spec.pages.map((page) => {
    if (page.slug !== "home") return page;
    if (page.sections.some((s) => s.component === "Gallery")) return page;
    const gallery: FYDSection = {
      id: "",
      component: "Gallery",
      query: { kind: "static" },
      presentation: {
        compositionVariant:
          galleryAssetCount >= GALLERY_MASONRY_THRESHOLD
            ? "masonry"
            : "grid",
      },
    };
    const sections = page.sections.slice();
    const peopleIdx = sections.findIndex((s) => s.component === "People");
    if (peopleIdx >= 0) {
      sections.splice(peopleIdx + 1, 0, gallery);
    } else {
      const anchorIdx = sections.findIndex(
        (s) => s.component === "RecentObjects" || s.component === "Contact",
      );
      if (anchorIdx >= 0) sections.splice(anchorIdx, 0, gallery);
      else sections.push(gallery);
    }
    const restamped = sections.map((s, i) => ({
      ...s,
      id: page.slug + ":" + s.component + ":" + i,
    }));
    return { ...page, sections: restamped };
  });
  return { ...spec, pages };
}

/**
 * The manifest focal point for a hero asset, validated and clamped to
 * 0..1. DisplayMedia carries no focal point (the selector strips it), so
 * the seam reads the manifest and threads it through. Null/absent: the
 * hero centers the photo. Never throws: a missing manifest or malformed
 * value degrades to the centered treatment.
 */
export function heroFocalPointFor(
  siteId: string,
  heroMedia: DisplayMedia | null,
): HeroFocalPointValue | null {
  if (!heroMedia) return null;
  try {
    const manifest = readPipelineManifest(siteId);
    const entry = manifest?.media.find((m) => m.id === heroMedia.id);
    const fp = entry?.focalPoint;
    if (
      !fp ||
      typeof fp.x !== "number" ||
      typeof fp.y !== "number" ||
      !Number.isFinite(fp.x) ||
      !Number.isFinite(fp.y)
    ) {
      return null;
    }
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp(fp.x), y: clamp(fp.y) };
  } catch {
    return null;
  }
}

export interface HeroFocalPointValue {
  x: number;
  y: number;
}

/** DisplayMedia with the manifest focal point attached by the seam. */
export type HeroMediaWithFocal = DisplayMedia & {
  focalPoint?: HeroFocalPointValue;
};

/**
 * Attach the manifest focal point to hero media for the render seam.
 * Returns the input unchanged when there is no focal point to attach.
 */
export function withHeroFocalPoint(
  siteId: string,
  hero: DisplayMedia | null,
): HeroMediaWithFocal | null {
  const focalPoint = heroFocalPointFor(siteId, hero);
  if (!hero || !focalPoint) return hero;
  return { ...hero, focalPoint };
}

export async function compilePublicSite(
  siteId: string,
): Promise<CompiledPublicSite> {
  // THE boundary: every fact below comes from the verified public
  // projection. The raw source graph never reaches the page.
  const projection = await getVerifiedPublicProjection(siteId, "anonymous");
  // FYD-Q1 defense-in-depth (LANE-CLAIM D2): the site bundle may declare
  // unresolved field conflicts. The ask lane withholds them via
  // suppressConflictedFields (visitor-answer publicGraphOf); /sites does
  // the same here so a disputed contact value can never render on a page
  // either. Inert in production today: buildBundle never sets
  // fieldConflicts. A bundle-read failure falls back to no declared
  // conflicts (today's behavior), never to a broken page.
  let declaredConflicts: AskFieldConflict[] = [];
  try {
    declaredConflicts = (await getSiteBundle(siteId))?.fieldConflicts ?? [];
  } catch {
    declaredConflicts = [];
  }
  const graph = suppressConflictedFields(projection.graph, declaredConflicts);
  const withheldConflictedFields = declaredConflicts
    .filter(isUnresolvedConflict)
    .map((c) => ({ objectId: c.objectId, field: c.field }));
  // meta + presentationIntent are server-side compile inputs, never
  // serialized: they come from the verified read seam alongside.
  const { meta, presentationIntent } = await getPingObjectGraph(siteId);
  // RENDER-WIRE: the website builder plans from the verified public graph
  // with the graph-derived archetype vector and the measured media input
  // (gallery counts, hero presence, photographic object ids). This is the
  // same planner the /build route uses: one pipeline, not two.
  const ownerId = ownerObjectIdForMedia(graph);
  const media = compositionMediaInput(siteId, graph, ownerId);
  const planned = planSite({
    ctx: { tenantId: siteId },
    graph,
    vector: vectorForSite(siteId, graph),
    generatedAt: meta.generatedAt,
    eventSequences: meta.eventSequences ?? undefined,
    media,
  });
  // Gallery: planSite's internal generateSiteSpec call has no site id, so
  // the manifest-backed Gallery emission cannot happen inside the planner.
  // The seam inserts it (see insertGallerySection): same position, same
  // variant vocabulary, same asset-minimum drop rule.
  const withGallery = insertGallerySection(planned.spec, media.galleryAssets);
  // PRESENTATION INTENT layer: approved owner directives applied OVER the
  // compiled spec. Facts (graph) and design system (theme) are untouched.
  const spec = applyPresentationIntent(withGallery, presentationIntent, graph).spec;
  // Hero + gallery media, resolved once per page load at the server render
  // seam. The focal point rides on the hero media for the hero component.
  const heroMedia = withHeroFocalPoint(
    siteId,
    await heroMediaFor(siteId, graph, spec.ownerObjectId),
  );
  const galleryAssets = galleryMediaFor(siteId, graph, ownerId);
  // Polish lane (2026-09-26): the logo-role asset for the visitor header
  // wordmark. listObjectMedia leads with the logo role; the first logo
  // wins, null when the manifest carries none for the owner.
  const ownerLogo =
    listObjectMedia(siteId, graph, ownerId).find((d) => d.role === "logo") ?? null;
  const knownSchemas = new Set(graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  return {
    projection,
    graph,
    spec,
    findings,
    renderable: isRenderable(findings),
    withheldConflictedFields,
    heroMedia,
    galleryAssets,
    ownerLogo,
  };
}
