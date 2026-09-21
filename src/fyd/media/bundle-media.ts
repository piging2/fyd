/**
 * H3 lane (media + presence + owner mode): media -> site-bundle seam.
 *
 * The pipeline manifests (src/fyd/media/manifests/*.json, fyd-media@1)
 * carry the full provenance chain: observation -> ingest -> digest ->
 * derivatives. The site bundle contract (./site-bundle.ts) only needs the
 * minimal authorized set, so this module is the filter: ONLY items with
 * rights === "authorized" are exposed as FYD-served media. Items marked
 * external_reference (e.g. third-party avatars) or unknown are NEVER
 * presented as FYD media; they stay references, exactly as the manifest
 * records them.
 *
 * Deterministic: items are sorted by id. No network, no mutation.
 */

import type {
  MediaManifest as BundleMediaManifest,
  SiteBundleMediaItem,
} from "./site-bundle";
import type { MediaManifest as PipelineMediaManifest } from "./types";

// resolveJsonModule is enabled in tsconfig.json.
import happyPlaceManifest from "./manifests/happy-place.json";
import coppersmithManifest from "./manifests/coppersmith-plumbing.json";

const PIPELINE_MANIFESTS: Record<string, PipelineMediaManifest> = {
  "happy-place": happyPlaceManifest as unknown as PipelineMediaManifest,
  "coppersmith-plumbing": coppersmithManifest as unknown as PipelineMediaManifest,
};

/**
 * Full pipeline manifest for a site (provenance, observations, variants),
 * or null for unknown site ids. Read-only: the imported JSON is never
 * mutated.
 */
export function getPipelineManifest(siteId: string): PipelineMediaManifest | null {
  return PIPELINE_MANIFESTS[siteId] ?? null;
}

/** Site ids with a pipeline manifest. */
export function listManifestSiteIds(): string[] {
  return Object.keys(PIPELINE_MANIFESTS).sort();
}

/**
 * Bundle-shaped media manifest: authorized items only, minimal fields.
 * This is what fills SiteBundle.mediaManifest; the bundle's visitor route
 * codes against it.
 */
export function getMediaManifest(siteId: string): BundleMediaManifest | null {
  const manifest = getPipelineManifest(siteId);
  if (!manifest) return null;
  const items: SiteBundleMediaItem[] = manifest.media
    .filter((m) => m.rights === "authorized")
    .map((m) => ({
      id: m.id,
      sourceUrl: m.provenance.sourceUrl,
      digest: m.digest,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { siteId: manifest.siteId, items };
}
