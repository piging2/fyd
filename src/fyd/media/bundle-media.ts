/**
 * H3 lane (media + presence + owner mode): media -> site-bundle seam.
 * Managed-pipeline lane (fyd-media@2): rights/source classification.
 * Media-hero-defects lane: production-truth validation.
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
 * Production-truth validation: the manifests are committed files in a
 * shared repo, so ANY writer (a preview run, a hand edit, a stale copy)
 * could land a plausible-looking file. getPipelineManifest applies
 * validatePipelineManifest on every read: only manifests stamped by the
 * production ingest pipeline (generator + ingestRunId + pipelineVersion
 * provenance, preview marker clear, every item rights-acquirable with
 * real bytes behind it) are served. Anything else is treated exactly
 * like a missing manifest: the caller renders unknown, never the file's
 * contents. Preview/experimental runs write outside this directory
 * (run-ingest.ts --preview -> manifests/preview/), so the production
 * read path cannot reach them even structurally.
 *
 * Deterministic: items are sorted by id. No network, no mutation.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MEDIA_MODULE_VERSION, isAcquirable } from "./types";
import type {
  MediaManifest as BundleMediaManifest,
  SiteBundleMediaItem,
} from "./site-bundle";
import type {
  FydMediaObject,
  MediaManifest as PipelineMediaManifest,
} from "./types";

/**
 * Production-truth validation for a pipeline manifest. Returns the
 * manifest when it is provably production pipeline output, null
 * otherwise. Every rejection is silent-by-design: a rejected manifest is
 * indistinguishable from a missing one to the caller, which renders
 * unknown rather than untrusted content.
 *
 * A manifest is production truth only when:
 * - it names the site being read (no cross-site file can slip in);
 * - it carries the production pipeline stamp (generator), the ingest
 *   run that minted it (ingestRunId), and a pipeline version matching
 *   the code reading it (stale manifests fail closed);
 * - it is not marked preview/experimental;
 * - every media object is rights-acquirable and has real bytes behind
 *   it (a digest plus at least one generated variant): invented imagery
 *   cannot satisfy this without going through the pipeline.
 */
export function validatePipelineManifest(
  raw: unknown,
  siteId: string,
): PipelineMediaManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<PipelineMediaManifest>;
  if (m.siteId !== siteId) return null;
  if (!Array.isArray(m.media)) return null;
  // Production pipeline stamp: the real ingest writes generator =
  // MEDIA_MODULE_VERSION. A missing, hand-written, or preview-origin
  // stamp is not servable truth.
  if (m.generator !== MEDIA_MODULE_VERSION) return null;
  // Preview/experimental artifacts are never production truth,
  // wherever the file sits.
  if (m.preview === true) return null;
  // The run that minted this manifest; a stale or hand-written file
  // cannot masquerade as pipeline output without it.
  if (typeof m.ingestRunId !== "string" || m.ingestRunId.length === 0)
    return null;
  // Stale manifests fail closed: a pipeline version bump retires old
  // manifests until a fresh ingest rewrites them.
  if (m.pipelineVersion !== MEDIA_MODULE_VERSION) return null;
  // Defense in depth: the real pipeline never mints non-acquirable or
  // byte-less media objects, so one in the file means the file did not
  // come through the pipeline. Reject the whole manifest, not the item:
  // a compromised file is untrustworthy as a unit.
  for (const item of m.media) {
    const o = item as Partial<FydMediaObject> | null;
    if (!o || typeof o !== "object") return null;
    if (!isAcquirable(o.rightsSource as FydMediaObject["rightsSource"]))
      return null;
    if (typeof o.digest !== "string" || o.digest.length === 0) return null;
    if (!Array.isArray(o.variants) || o.variants.length === 0) return null;
  }
  return m as PipelineMediaManifest;
}

/**
 * Full pipeline manifest for a site (provenance, observations, variants),
 * or null for unknown site ids / unreadable files / files that fail
 * production-truth validation. Missing or untrusted data is not a
 * failure: the caller renders unknown, never a substitute.
 */
export function getPipelineManifest(
  siteId: string,
): PipelineMediaManifest | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "src", "fyd", "media", "manifests", siteId + ".json"),
      "utf8",
    );
    return validatePipelineManifest(JSON.parse(raw), siteId);
  } catch {
    return null;
  }
}

/**
 * Site ids with a pipeline manifest (scanned, not hardcoded). Only the
 * production directory is scanned: manifests/preview/ is namespaced out
 * and never listed.
 */
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
