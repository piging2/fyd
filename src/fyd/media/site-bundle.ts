/**
 * FYD site bundle: the read-only seam between the generated site fixtures
 * and the server-side Ask FYD visitor API.
 *
 * A SiteBundle joins one demo business's object graph with the SiteSpec the
 * generator produces from it, exactly as the public /sites pages render it
 * (same fixture, same generator inputs), plus the validator findings and a
 * renderability verdict.
 *
 * This module owns this contract. The visitor route codes against it; the
 * media lane owns the contents of mediaManifest (null until it ships).
 */
import { HAPPY_PLACE_GRAPH } from "../proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../proceduralize/generator";
import { isRenderable, validateSiteSpec } from "../sitespec/validator";
import type { FYDFinding, FYDSiteSpec, ObjectGraph } from "../sitespec/types";

/** One media item in the bundle manifest. Minimal until the media lane ships. */
export interface SiteBundleMediaItem {
  id: string;
  sourceUrl: string;
  digest: string | null;
}

/** Media manifest for a site. Null until the media lane produces manifests. */
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
}

interface BundleDef {
  graph: ObjectGraph;
  generatedAt: string;
  eventSequences?: [number, number];
}

// The generatedAt values match the public /sites pages exactly, so the
// bundle's SiteSpec is identical to the spec the page renders.
const BUNDLE_DEFS: Record<string, BundleDef> = {
  "happy-place": {
    graph: HAPPY_PLACE_GRAPH,
    generatedAt: "2026-09-21T12:00:00.000Z",
    eventSequences: [65, 83],
  },
  "coppersmith-plumbing": {
    graph: COPPERSMITH_GRAPH,
    generatedAt: "2026-09-21T12:01:10.844Z",
  },
};

const bundleCache = new Map<string, SiteBundle>();

function businessNameFor(graph: ObjectGraph, spec: FYDSiteSpec, siteId: string): string {
  const owner = graph.objects.find((o) => o.id === spec.ownerObjectId);
  if (owner && owner.title.trim().length > 0) return owner.title;
  const business = graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  if (business && business.title.trim().length > 0) return business.title;
  return siteId;
}

function buildBundle(siteId: string, def: BundleDef): SiteBundle {
  const spec = generateSiteSpec(def.graph, {
    generatedAt: def.generatedAt,
    eventSequences: def.eventSequences,
  });
  const findings = validateSiteSpec(spec, new Set(def.graph.objects.map((o) => o.schema)));
  return {
    siteId,
    businessName: businessNameFor(def.graph, spec, siteId),
    graph: def.graph,
    spec,
    findings,
    renderable: isRenderable(findings),
    // The media lane owns this value; until it ships, the bundle carries null.
    mediaManifest: null,
  };
}

/** Return the bundle for a known site id, or null for unknown ids. */
export function getSiteBundle(siteId: string): SiteBundle | null {
  const def = BUNDLE_DEFS[siteId];
  if (!def) return null;
  let bundle = bundleCache.get(siteId);
  if (!bundle) {
    bundle = buildBundle(siteId, def);
    bundleCache.set(siteId, bundle);
  }
  return bundle;
}

/** Site ids this bundle module can serve. */
export function listSiteIds(): string[] {
  return Object.keys(BUNDLE_DEFS);
}
