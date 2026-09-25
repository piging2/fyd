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
 */

import {
  getPingObjectGraph,
  getVerifiedPublicProjection,
} from "@/fyd/data/ping-object-source";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
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
  FYDSiteSpec,
  ObjectGraph,
} from "@/fyd/sitespec/types";

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
  const base = generateSiteSpec(graph, {
    generatedAt: meta.generatedAt,
    eventSequences: meta.eventSequences ?? undefined,
    // Media-backed section emission (Gallery): the generator consults the
    // site media manifest when a site id is present. Generic: every page
    // passes only its site id; no per-site branching.
    siteId,
  });
  // PRESENTATION INTENT layer: approved owner directives applied OVER the
  // compiled spec. Facts (graph) and design system (theme) are untouched.
  const spec = applyPresentationIntent(base, presentationIntent, graph).spec;
  const knownSchemas = new Set(graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  return {
    projection,
    graph,
    spec,
    findings,
    renderable: isRenderable(findings),
    withheldConflictedFields,
  };
}

