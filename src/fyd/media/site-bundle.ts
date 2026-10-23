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
import { applyOwnerFieldCorrections } from "../object/owner-overlay";
import { readOverrides } from "../object/owner-store";
import { decisionsForGraph, verifyPublicProjection, type VerifiedPublicProjection } from "../sitespec/public-projection";
import { applyPresentationIntent } from "../customize/apply-layer";
import { suppressConflictedFields, type AskFieldConflict } from "../ask/field-conflicts";
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
  /** The resolved public read product. Optional only for legacy pure test fixtures. */
  projection?: VerifiedPublicProjection;
  /** Server-only owner read and source observations captured in the same bundle. */
  ownerProjection?: VerifiedPublicProjection;
  sourceGraph?: ObjectGraph;
  /** Server-only captured owner reads: never serialize this function or raw history. */
  readOwner?: typeof readOverrides;
  conflictState?: "available";
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
  opts?: { reader?: FydOverlayReader; readConflicts?: () => Promise<AskFieldConflict[]> },
): Promise<SiteBundle> {
  const tenant = await getFydTenantGraph(siteId, opts?.reader ? { reader: opts.reader } : undefined);
  // Capture each existing owner log once. Later consumers cannot reread a
  // newer correction or visibility preference under this checkpoint.
  const states = new Map<string, ReturnType<typeof readOverrides>>();
  for (const key of new Set([siteId, ...tenant.graph.objects.map(o => o.id)])) {
    states.set(key, readOverrides(key));
  }
  const readOwner: typeof readOverrides = key => {
    const state = states.get(key);
    if (!state) throw new Error("Owner state was not captured for this projection.");
    return state;
  };
  // Existing bundles have no conflict producer yet. Zero means no declared
  // conflicts in this successful read, never an unavailable read converted to [].
  const conflicts = opts?.readConflicts ? await opts.readConflicts() : [];
  if (!Array.isArray(conflicts) || conflicts.some(c => !c || typeof c.objectId !== "string" || typeof c.field !== "string" ||
      !["unresolved", "resolved"].includes(c.status) || !Array.isArray(c.observations) ||
      (c.status === "unresolved" && c.observations.length < 2) ||
      c.observations.some(o => !o || typeof o.value !== "string" || typeof o.provenanceRef !== "string" || typeof o.provenanceKind !== "string"))) {
    throw new Error("Conflict information unavailable.");
  }
  const corrected = applyOwnerFieldCorrections(tenant.graph, siteId, readOwner).graph;
  const decisions = decisionsForGraph(corrected, siteId, readOwner);
  const projection = verifyPublicProjection(suppressConflictedFields(corrected, conflicts), decisions, "anonymous", {sourceDigest:tenant.meta.graphDigest, conflicts, presentationIntent:tenant.presentationIntent});
  const ownerProjection = verifyPublicProjection(suppressConflictedFields(corrected, conflicts), decisions, "owner", {sourceDigest:tenant.meta.graphDigest, conflicts, presentationIntent:tenant.presentationIntent});
  const graph = projection.graph;
  const base = generateSiteSpec(graph, {
    generatedAt: tenant.meta.generatedAt,
    eventSequences: tenant.meta.eventSequences ?? undefined,
    siteId,
  });
  const spec = applyPresentationIntent(base, tenant.presentationIntent, graph).spec;
  const findings = validateSiteSpec(spec, new Set(graph.objects.map((o) => o.schema)));
  return {
    siteId, projection, ownerProjection, sourceGraph: tenant.graph, readOwner, conflictState: "available",
    businessName: businessNameFor(graph, spec, siteId), graph, spec, findings,
    renderable: isRenderable(findings),
    mediaManifest: getMediaManifest(siteId),
    fieldConflicts: conflicts,
    fieldVisibilityDecisions: decisions,
  };
}

/**
 * Return the bundle for a known site id, or null for unknown ids.
 *
 * Bounded TTL cache (60s): the bundle is rebuilt at most once per minute
 * per site, not on every request. This fixes a memory leak where per-request
 * rebuilds accumulated unreleased native memory (2026-10-08: +0.17MB heap
 * per /sites request, +500MB RSS from 100 requests). Freshness is preserved
 * (max 60s stale) while preventing unbounded growth. Cache is bounded by
 * tenant count (small) with TTL eviction.
 */
const bundleCache = new Map<string, { bundle: SiteBundle | null; at: number }>();
const BUNDLE_TTL_MS = 60_000;

/**
 * Invalidate the cached bundle for one site id.
 *
 * Call immediately AFTER an authoritative write commits (owner correction,
 * approved proposal, presentation-intent overlay, regeneration, source
 * replacement, company-data update). Required order: WRITE COMMITS ->
 * INVALIDATE -> NEXT READ REBUILDS FROM NEW TRUTH. Do not call before the
 * write commits; if the write rolls back, the old cache stays valid.
 *
 * Surgical: only the affected site entry is dropped. A write to site A
 * never flushes site B. TTL remains a safety fallback; TTL is not
 * consistency.
 */
export function invalidateSiteBundle(siteId: string): void {
  bundleCache.delete(siteId);
}
export async function getSiteBundle(
  siteId: string,
  opts?: { reader?: FydOverlayReader; readConflicts?: () => Promise<AskFieldConflict[]> },
): Promise<SiteBundle | null> {
  if (!getFydTenantIds().includes(siteId)) return null;
  // Bypass cache when custom reader/conflicts are provided (tests, overlays)
  if (opts?.reader || opts?.readConflicts) {
    return buildBundle(siteId, opts);
  }
  const now = Date.now();
  const cached = bundleCache.get(siteId);
  if (cached && (now - cached.at) < BUNDLE_TTL_MS) {
    return cached.bundle;
  }
  const bundle = await buildBundle(siteId, opts);
  bundleCache.set(siteId, { bundle, at: now });
  return bundle;
}

/**
 * Site ids this bundle module can serve: the pinned authorized tenant
 * registry (src/fyd/data/fyd-tenant-graph.ts).
 */
export function listSiteIds(): string[] {
  return getFydTenantIds();
}
