/**
 * FYD semantic render model.
 *
 * Semantic determinism, not DOM-byte determinism: the same SiteSpec +
 * ObjectGraph snapshot + ViewerContext + OwnerOverrides + renderer version
 * + design-token version must always produce the same semantic rendered
 * experience.
 *
 * Owner overrides enter through the projected graph (buildRenderContext
 * applies them before the model is built), but the model ALSO records the
 * override set explicitly: two models built from the same source graph
 * with different owner decisions must differ, so the invariant is visible
 * in the model itself rather than only implicit in the input.
 *
 * This module is the projection seam's deterministic summary: it resolves
 * every section query through the real render path (resolveQuery, whose
 * ordering is the renderer's ordering contract) and records the result as
 * plain data. It contains no layout, no styling, no wall-clock reads, no
 * randomness, and no module-level mutable state.
 *
 * RENDER_MODEL_VERSION must be bumped whenever renderer.ts render semantics
 * change (query resolution ordering, section visibility rules, or what data
 * a section binds).
 */

import { resolveQuery } from "../components/renderer";
import type { FieldVisibilityDecision } from "./field-visibility";
import type { FYDSiteSpec, ObjectGraph, ViewerContext } from "./types";

/** Semantic render-model version. Bump when renderer.ts render semantics change. */
export const RENDER_MODEL_VERSION = 1;

/**
 * renderer.tsx carries no version constant (gap, 2026-09-21): until the
 * renderer lane versions its render semantics, the model pins the source
 * file that defines them.
 */
export const RENDERER_VERSION = "renderer.tsx@unversioned";

/**
 * FYDThemeTokens carries no version field (gap, 2026-09-21): until the
 * sitespec lane versions its design tokens, the model records an explicit
 * placeholder (overridable per build via options).
 */
export const DESIGN_TOKEN_VERSION = "tokens@unversioned";

/** One rendered section: its identity, its component, and the objects it binds, in render order. */
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

/** The full semantic render model: the deterministic summary of one render. */
export interface SemanticRenderModel {
  renderModelVersion: number;
  rendererVersion: string;
  designTokenVersion: string;
  viewerId: string | null;
  /** Genuine time dependence enters only here, never via hidden wall-clock. */
  asOf: string;
  specKind: string;
  /**
   * The owner-visibility decisions this model was built under, in stable
   * canonical form ("none" when the caller passed none). Part of the
   * determinism invariant: same decisions -> same model.
   */
  ownerOverrides: string;
  /** Pages in spec order. */
  pages: SemanticPageModel[];
}

export interface BuildRenderModelOptions {
  asOf: string;
  designTokenVersion?: string;
  /**
   * Owner visibility decisions applied to the input graph. Canonicalized
   * (sorted, JSON) before recording so decision order never affects the
   * model.
   */
  ownerOverrides?: FieldVisibilityDecision[];
}

/**
 * Build the semantic render model. Pure function of its inputs:
 * pages and sections are visited in spec order, and objectIds preserve
 * resolveQuery's deterministic ordering (updatedAt desc with id tiebreak;
 * "related" sorted by id). No Date.now(), no Math.random(), no counters,
 * no request-order-dependent ids.
 */
export function buildSemanticRenderModel(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
  viewer: ViewerContext,
  opts: BuildRenderModelOptions,
): SemanticRenderModel {
  const pages: SemanticPageModel[] = spec.pages.map((page) => ({
    slug: page.slug,
    sections: page.sections.map((section) => ({
      id: section.id,
      component: section.component,
      objectIds: resolveQuery(section.query, graph, spec.ownerObjectId).map((o) => o.id),
      heading: section.presentation.heading,
      copy: section.presentation.copy,
    })),
  }));
  return {
    renderModelVersion: RENDER_MODEL_VERSION,
    rendererVersion: RENDERER_VERSION,
    designTokenVersion: opts.designTokenVersion ?? DESIGN_TOKEN_VERSION,
    viewerId: viewer.viewerId,
    asOf: opts.asOf,
    specKind: spec.kind,
    ownerOverrides: canonicalizeOverrides(opts.ownerOverrides),
    pages,
  };
}

/**
 * Stable canonical form of the owner-override set: decisions sorted by
 * (objectId, field, decision) and JSON-encoded, so the same logical
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
