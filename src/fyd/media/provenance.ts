/**
 * FYD media provenance query surface (fyd-media@2).
 *
 * Read-only. The manifests (src/fyd/media/manifests/*.json) are the
 * read-model-adjacent store; this module is the queryable projection over
 * them. Ask FYD and WHY THIS cite these records; the API route
 * src/app/api/fyd/media/route.ts serves them.
 *
 * Every record carries the full chain: original source URL, observed_at,
 * content digest (sha256 of the original bytes), media type, dimensions,
 * rights/source classification (never implying FYD copyright ownership),
 * and the derived-asset relationship (each variant names the original
 * digest it was produced from). Unclear-reference-only assets are never
 * minted as media objects, so they never appear here; their source
 * reference lives in the manifest observations only.
 *
 * Deterministic: no network, no mutation, no caches.
 */

import { getPipelineManifest } from "./bundle-media";
import { isAcquirable, type FydMediaObject } from "./types";

export interface ProvenanceDerivedAsset {
  name: string;
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  /** SHA-256 of this derivative's bytes. */
  digest: string;
  /** SHA-256 of the ORIGINAL bytes this derivative was produced from. */
  derivedFrom: string;
  /** Local managed storage; derivatives are served from here, never hotlinked. */
  servedFrom: string;
}

export interface MediaProvenanceRecord {
  assetId: string;
  siteId: string;
  title: string;
  mediaType: "image";
  /** SHA-256 of the original fetched bytes. Dedupe key; content address. */
  digest: string;
  width: number;
  height: number;
  originalFormat: string;
  roles: string[];
  rightsSource: FydMediaObject["rightsSource"];
  /** Authorization basis sentence; never implies FYD copyright ownership. */
  rightsBasis: string;
  provenance: {
    sourceUrl: string;
    sourcePage: string;
    observedAt: string;
    redirectChain?: string[];
    fetchNote?: string;
  };
  derivedAssets: ProvenanceDerivedAsset[];
  altText: string | null;
  altTextSource: "source" | "generated" | "none";
}

function toRecord(siteId: string, m: FydMediaObject): MediaProvenanceRecord {
  return {
    assetId: m.id,
    siteId,
    title: m.title,
    mediaType: m.mediaType,
    digest: m.digest,
    width: m.width,
    height: m.height,
    originalFormat: m.originalFormat,
    roles: [...m.roles],
    rightsSource: m.rightsSource,
    rightsBasis: m.rightsBasis,
    provenance: { ...m.provenance },
    derivedAssets: m.variants.map((v) => ({
      name: v.name,
      url: v.url,
      width: v.width,
      height: v.height,
      format: v.format,
      bytes: v.bytes,
      digest: v.digest,
      derivedFrom: v.derivedFrom,
      servedFrom: "/fyd-media/" + m.digest + "/",
    })),
    altText: m.altText,
    altTextSource: m.altTextSource,
  };
}

/**
 * Full provenance record for one asset, by site and original-content
 * digest. Returns null for unknown sites, unknown digests, or assets the
 * pipeline refused to acquire (reference-only by construction).
 */
export function getMediaProvenance(
  siteId: string,
  digest: string,
): MediaProvenanceRecord | null {
  const manifest = getPipelineManifest(siteId);
  if (!manifest) return null;
  const asset = manifest.media.find(
    (m) => m.digest === digest && isAcquirable(m.rightsSource),
  );
  return asset ? toRecord(manifest.siteId, asset) : null;
}

/**
 * Provenance summaries for every acquired asset of a site, sorted by
 * asset id. Null for unknown sites.
 */
export function listMediaProvenance(siteId: string): MediaProvenanceRecord[] | null {
  const manifest = getPipelineManifest(siteId);
  if (!manifest) return null;
  return manifest.media
    .filter((m) => isAcquirable(m.rightsSource))
    .map((m) => toRecord(manifest.siteId, m))
    .sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
}
