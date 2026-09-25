/**
 * FYD semantic render model.
 *
 * Honest scope: this is a SECTION-BINDING MANIFEST, not a full semantic
 * render model. It records which sections bind which objects in render
 * order, plus the versioned contract the binding was computed under. It
 * does not capture layout, styling, interaction, or the final DOM; naming
 * it a "semantic render model" overstates what it proves, so the docs say
 * the smaller true thing.
 *
 * Semantic determinism, not DOM-byte determinism: the same SiteSpec +
 * VerifiedPublicProjection + renderer version + design-token version must
 * always produce the same manifest.
 *
 * Identity is semantic, not temporal (Q-C-02): the model records the
 * projection checkpoint (graphDigest:decisionsDigest), the graph and
 * decisions digests, and the viewer policy digest. It does NOT record an
 * arbitrary viewerId or a wall-clock asOf: two builds from the same
 * projection are identical, and two builds from different projections
 * (different owner decisions, different source graph) differ visibly in
 * the model itself.
 *
 * The input graph MUST be a VerifiedPublicProjection: the model is built
 * over the already-authorized public graph, never over a raw source graph.
 * Owner decisions are read from the projection (the decisions that
 * actually shaped the graph), never from a caller-supplied claim.
 *
 * This module contains no layout, no styling, no wall-clock reads, no
 * randomness, and no module-level mutable state.
 *
 * RENDER_MODEL_VERSION must be bumped whenever renderer.ts render semantics
 * change (query resolution ordering, section visibility rules, or what data
 * a section binds).
 */

import {
  applyHiddenObjects,
  applyObjectOrder,
  resolveQuery,
  siteDeactivatedObjectIds,
} from "../components/renderer";
import {
  COMPONENT_CATALOG_DIGEST,
  THEME_TOKENS_DIGEST,
} from "./contract-digests";
import type { FieldVisibilityDecision } from "./field-visibility";
import type {
  PublicViewerKind,
  VerifiedPublicProjection,
} from "./public-projection";
import type { FYDSiteSpec } from "./types";

/** Semantic render-model version. Bump when renderer.ts render semantics change. */
export const RENDER_MODEL_VERSION = 1;

/**
 * Semantic version of the render contract (Q-C-03): the section component
 * catalog pinned by digest. Any catalog change rotates this version and
 * fails the contract-drift check until the digests are regenerated.
 */
export const RENDERER_VERSION =
  `renderer-components@${COMPONENT_CATALOG_DIGEST.slice(0, 16)}`;

/**
 * Semantic version of the design-token contract (Q-C-03): FYDThemeTokens
 * and its token interfaces pinned by digest.
 */
export const DESIGN_TOKEN_VERSION =
  `tokens@${THEME_TOKENS_DIGEST.slice(0, 16)}`;

/**
 * One rendered section: its identity, its component, and the objects it
 * binds, in the order the real render path emits them (resolveQuery,
 * then the owner-approved objectOrder, then owner-hidden object
 * exclusion). Sections with presentation.hidden never render and are
 * absent from the model.
 */
export interface SemanticSectionModel {
  id: string;
  component: string;
  /** Object ids in the order resolveQuery returns (already deterministically sorted; never re-sorted here). */
  objectIds: string[];
  heading?: string;
  copy?: string;
}

/** One rendered page, sections in spec order. */
export interface SemanticPageModel {
  slug: string;
  sections: SemanticSectionModel[];
}

/** The section-binding manifest: the deterministic summary of one render. */
export interface SemanticRenderModel {
  renderModelVersion: number;
  rendererVersion: string;
  designTokenVersion: string;
  /**
   * Semantic checkpoint of the projection this manifest was built from:
   * `${graphDigest}:${decisionsDigest}`. Replaces the old arbitrary asOf:
   * identity is what the projection contained, not when it was built.
   */
  checkpoint: string;
  /** sha256 of the source graph, carried over from the projection receipt. */
  graphDigest: string;
  /** sha256 of the owner decisions applied, carried over from the receipt. */
  decisionsDigest: string;
  /** The viewer policy the projection was built under. */
  viewerKind: PublicViewerKind;
  /** sha256 of the resolved viewer policy, carried over from the receipt. */
  viewerPolicyDigest: string;
  specKind: string;
  /**
   * The owner-visibility decisions this manifest was built under, in stable
   * canonical form ("none" when the projection carried none). Read from the
   * projection itself: same projection -> same manifest, always.
   */
  ownerOverrides: string;
  /** Pages in spec order. */
  pages: SemanticPageModel[];
}

export interface BuildRenderModelOptions {
  designTokenVersion?: string;
}

/**
 * Build the section-binding manifest. Pure function of its inputs:
 * pages and sections are visited in spec order, and objectIds follow
 * the real render path's ordering: resolveQuery's deterministic ordering
 * (updatedAt desc with id tiebreak; "related" sorted by id), then the
 * owner-approved objectOrder, then owner-hidden object exclusion.
 * No Date.now(), no Math.random(), no counters, no request-order-
 * dependent ids.
 */
export function buildSemanticRenderModel(
  spec: FYDSiteSpec,
  projection: VerifiedPublicProjection,
  opts: BuildRenderModelOptions = {},
): SemanticRenderModel {
  const graph = projection.graph;
  // The real render seam (renderSection in components/renderer.tsx):
  // an owner-hidden object is excluded from every surface site-wide.
  const hiddenObjectIds = siteDeactivatedObjectIds(spec);
  const pages: SemanticPageModel[] = spec.pages.map((page) => ({
    slug: page.slug,
    sections: page.sections
      // presentation.hidden sections never render: the model mirrors the
      // real path and omits them.
      .filter((section) => !section.presentation.hidden)
      .map((section) => {
        // Mirror the real render path exactly: query resolution, then the
        // owner-approved objectOrder, then owner-hidden object exclusion.
        const objects = applyHiddenObjects(
          applyObjectOrder(
            resolveQuery(section.query, graph, spec.ownerObjectId),
            section.presentation.objectOrder,
          ),
          hiddenObjectIds,
        );
        return {
          id: section.id,
          component: section.component,
          objectIds: objects.map((o) => o.id),
          heading: section.presentation.heading,
          copy: section.presentation.copy,
        };
      }),
  }));
  return {
    renderModelVersion: RENDER_MODEL_VERSION,
    rendererVersion: RENDERER_VERSION,
    designTokenVersion: opts.designTokenVersion ?? DESIGN_TOKEN_VERSION,
    checkpoint: projection.provenance.checkpoint,
    graphDigest: projection.provenance.graphDigest,
    decisionsDigest: projection.provenance.decisionsDigest,
    viewerKind: projection.provenance.viewerKind,
    viewerPolicyDigest: projection.provenance.viewerPolicyDigest,
    specKind: spec.kind,
    ownerOverrides: canonicalizeOverrides(projection.decisions),
    pages,
  };
}

/**
 * Stable canonical form of the owner-override set: decisions sorted by
 * (objectId, field, policy) and JSON-encoded, so the same logical
 * decision set always records the same string regardless of input order.
 */
export function canonicalizeOverrides(
  decisions: FieldVisibilityDecision[] | undefined,
): string {
  if (!decisions || decisions.length === 0) return "none";
  const sorted = decisions
    .slice()
    .sort((a, b) =>
      a.objectId !== b.objectId
        ? a.objectId < b.objectId
          ? -1
          : 1
        : a.field !== b.field
          ? a.field < b.field
            ? -1
            : 1
          : a.policy < b.policy
            ? -1
            : 1,
    );
  return JSON.stringify(sorted);
}

/** Recursively sort object keys. Arrays keep their order (objectIds order is significant). */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical string encoding of a model: JSON with recursively sorted object
 * keys. Two models are semantically identical iff their canonical forms are
 * byte-identical. No new dependencies; deterministic across processes.
 */
export function canonicalizeModel(model: SemanticRenderModel): string {
  return JSON.stringify(sortKeys(model));
}

