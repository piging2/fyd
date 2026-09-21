/**
 * H3 lane (media + presence + owner mode): media -> site-bundle seam.
 * Managed-pipeline lane (fyd-media@2): rights/source classification.
 *
 * Server-only (node:fs): the pipeline manifests
 * (src/fyd/media/manifests/*.json) are read from disk on every call so a
 * re-ingest is visible immediately — freshness outranks the memo. Never
 * import this module from a client component.
 *
 * The manifests carry the full provenance chain: observation -> ingest ->
 * digest -> derivatives. The site bundle contract (./site-bundle.ts) only
 * needs the minimal acquired set, so this module is the filter: ONLY
 * assets with an acquirable rightsSource (business-provided |
 * public-demo-source, via isAcquirable()) are exposed as FYD-served media.
 * Assets classified unclear-reference-only are NEVER presented as FYD
 * media; they stay source references in the manifest observations,
 * exactly as the rights gate recorded them.
 *
 * Deterministic: items are sorted by id. No network, no mutation.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAcquirable } from "./types";
import type {
  MediaManifest as BundleMediaManifest,
  SiteBundleMediaItem,
} from "./site-bundle";
import type { MediaManifest as PipelineMediaManifest } from "./types";

/**
 * Full pipeline manifest for a site (provenance, observations, variants),
 * or null for unknown site ids / unreadable files. Missing data is not a
 * failure: the caller renders unknown, never a substitute.
 */
export function getPipelineManifest(siteId: string): PipelineMediaManifest | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "src", "fyd", "media", "manifests", siteId + ".json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as PipelineMediaManifest;
    if (!parsed || !Array.isArray(parsed.media)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Site ids with a pipeline manifest (scanned, not hardcoded). */
export function listManifestSiteIds(): string[] {
  try {
    return readdirSync(join(process.cwd(), "src", "fyd", "media", "manifests"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Bundle-shaped media manifest: acquired items only (rights gate), minimal
 * fields. This is what fills SiteBundle.mediaManifest; the bundle's
 * visitor route codes against it.
 */
export function getMediaManifest(siteId: string): BundleMediaManifest | null {
  const manifest = getPipelineManifest(siteId);
  if (!manifest) return null;
  const items: SiteBundleMediaItem[] = manifest.media
    .filter((m) => isAcquirable(m.rightsSource))
    .map((m) => ({
      id: m.id,
      sourceUrl: m.provenance.sourceUrl,
      digest: m.digest,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { siteId: manifest.siteId, items };
}
