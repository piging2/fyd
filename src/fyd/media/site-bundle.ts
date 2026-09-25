/**
 * FYD site bundle: the read-only seam between the authorized tenant graph
 * read and the server-side Ask FYD visitor API.
 *
 * A SiteBundle joins one demo business's object graph (fixture base graph +
 * journal overlays composed through the governed PingObjectReader read,
 * digest-verified at both layers) with the SiteSpec the generator produces
 * from it, exactly as the public /sites pages render it (same graph, same
 * generator inputs), plus the validator findings and a renderability
 * verdict.
 *
 * The graph read is the authorized application read
 * (src/fyd/data/fyd-tenant-graph.ts). There is deliberately no other way to
 * build a bundle: NO dump.py disk JSON, NO FYD_PROJECTION_DIR, NO direct
 * Postgres reads, NO raw journal reads.
 *
 * No customer fact is hardcoded here: the graph, the spec compile pins, and
 * the business name all come from the authorized read. This keeps Ask FYD
 * answers and the rendered pages on the same facts: both read the same
 * graph.
 *
 * This module owns this contract. The visitor route codes against it; the
 * media lane owns the contents of mediaManifest (the rights-gated set of
 * FYD-served, provenance-backed media items for the site).
 */
import {
  getFydTenantGraph,
  getFydTenantIds,
  type FydOverlayReader,
} from "../data/fyd-tenant-graph";
import { getMediaManifest } from "./bundle-media";
import { generateSiteSpec } from "../proceduralize/generator";
import { isRenderable, validateSiteSpec } from "../sitespec/validator";
import type { FYDFinding, FYDSiteSpec, ObjectGraph } from "../sitespec/types";

/** One media item in the bundle manifest: rights-gated, provenance-backed. */
export interface SiteBundleMediaItem {
  id: string;
  sourceUrl: string;
  digest: string | null;
}

/** Media manifest for a site. The rights-gated set of FYD-served items. */
export interface MediaManifest {
  siteId: string;
  items: SiteBundleMediaItem[];
}

export interface SiteBundle {
  siteId: string;
  businessName: string;
  graph: ObjectGraph;
  spec: FYDSiteSpec;
  findings: FYDFinding[];
  renderable: boolean;
  mediaManifest: MediaManifest | null;
  /**
   * Declared unresolved field conflicts (FYD-Q1). Honored fail-closed by
   * the ask pipeline. Detection belongs to the observing lane; the bundle
   * carries the declaration. Defaults to none.
   */
  fieldConflicts?: import("../ask/field-conflicts").AskFieldConflict[];
  /**
   * Owner field-visibility decisions (FYD-Q2). Honored by the ask
   * pipeline's public projection. Defaults to conservative defaults only.
   */
  fieldVisibilityDecisions?: import("../sitespec/field-visibility").FieldVisibilityDecision[];
}

function businessNameFor(graph: ObjectGraph, spec: FYDSiteSpec, siteId: string): string {
  const owner = graph.objects.find((o) => o.id === spec.ownerObjectId);
  if (owner && owner.title.trim().length > 0) return owner.title;
  const business = graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  if (business && business.title.trim().length > 0) return business.title;
  return siteId;
}

async function buildBundle(
  siteId: string,
  reader?: FydOverlayReader,
): Promise<SiteBundle> {
  const tenant = await getFydTenantGraph(siteId, reader ? { reader } : undefined);
  const { graph, meta } = tenant;
  const spec = generateSiteSpec(graph, {
    generatedAt: meta.generatedAt,
    eventSequences: meta.eventSequences ?? undefined,
  });
  const findings = validateSiteSpec(spec, new Set(graph.objects.map((o) => o.schema)));
  return {
    siteId,
    businessName: businessNameFor(graph, spec, siteId),
    graph,
    spec,
    findings,
    renderable: isRenderable(findings),
    // The media lane owns this value: the rights-gated, provenance-backed
    // manifest of FYD-served media for the site (null when the site has no
    // pipeline manifest). Ask FYD cites these items, never hotlinks.
    mediaManifest: getMediaManifest(siteId),
  };
}

/**
 * Return the bundle for a known site id, or null for unknown ids.
 *
 * Deliberately uncached and async: the bundle is rebuilt through the
 * authorized graph read on every call, so a newly journaled overlay is
 * visible to Ask FYD on the next request. The graphs are tiny; freshness
 * outranks the memo.
 */
export async function getSiteBundle(
  siteId: string,
  opts?: { reader?: FydOverlayReader },
): Promise<SiteBundle | null> {
  if (!getFydTenantIds().includes(siteId)) return null;
  return buildBundle(siteId, opts?.reader);
}

/**
 * Site ids this bundle module can serve: the pinned authorized tenant
 * registry (src/fyd/data/fyd-tenant-graph.ts).
 */
export function listSiteIds(): string[] {
  return getFydTenantIds();
}
