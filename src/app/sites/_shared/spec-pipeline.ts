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

import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import { getSiteBundle } from "@/fyd/media/site-bundle";
import { isUnresolvedConflict } from "@/fyd/ask/field-conflicts";
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
  const bundle = await getSiteBundle(siteId);
  if (!bundle?.projection) throw new Error("Business information unavailable.");
  return {
    projection: bundle.projection,
    graph: bundle.graph,
    spec: bundle.spec,
    findings: bundle.findings,
    renderable: bundle.renderable,
    withheldConflictedFields: (bundle.fieldConflicts ?? [])
      .filter(isUnresolvedConflict).map(c => ({ objectId: c.objectId, field: c.field })),
  };
}
