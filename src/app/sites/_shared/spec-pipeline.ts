/**
 * FYD Social shared site render pipeline. SERVER ONLY.
 *
 * The single compile seam for every /sites/* demo page: read the site's
 * PING-backed projection, compile the base SiteSpec from the object
 * graph, apply the approved presentation-intent layer OVER the compiled
 * spec, then validate. Facts (graph) and the design system (theme) are
 * never touched by the intent layer.
 *
 * Zero per-site conditionals: pages pass only their site id. A new site
 * gets presentation-intent application for free by calling this seam;
 * no page may compile or render a spec that bypasses the intent layer.
 */

import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { applyPresentationIntent } from "@/fyd/customize/apply-layer";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";
import type {
  FYDFinding,
  FYDSiteSpec,
  ObjectGraph,
} from "@/fyd/sitespec/types";

export interface CompiledSite {
  /** Full server-side graph (facts; may include private objects). */
  graph: ObjectGraph;
  /** Compiled spec with the approved presentation intent applied. */
  spec: FYDSiteSpec;
  findings: FYDFinding[];
  renderable: boolean;
}

export async function compileSiteSpecWithIntent(
  siteId: string,
): Promise<CompiledSite> {
  const { graph, meta, presentationIntent } = await getPingObjectGraph(siteId);
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
  return { graph, spec, findings, renderable: isRenderable(findings) };
}

/**
 * Privacy boundary: the client payload must never contain private
 * objects. The server keeps the full graph; the serialized prop carries
 * only public objects and relationships between public objects.
 */
export function publicGraph(graph: ObjectGraph): ObjectGraph {
  const ids = new Set(
    graph.objects.filter((o) => o.visibility === "public").map((o) => o.id),
  );
  return {
    ...graph,
    objects: graph.objects.filter((o) => ids.has(o.id)),
    relationships: graph.relationships.filter(
      (r) => ids.has(r.subject) && ids.has(r.object),
    ),
  };
}
