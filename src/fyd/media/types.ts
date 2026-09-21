/**
 * FYD media authority types.
 *
 * HARVEST (media-archaeology 2026-09-21):
 * - ADAPT src/types/media.ts: lifecycle states (source_reference -> fetched
 *   -> digested -> derivatives_ready -> published -> stale) and the variant
 *   model (original + named renditions). The Drive-file lineage there does
 *   not fit; FYD provenance is source URL + source page + observed_at.
 * - REUSE src/lib/media-constants.ts rendition constants (imported by
 *   derivatives.ts, not duplicated here).
 * - REUSE src/lib/media-contracts.ts shape-vs-proof separation: a variant
 *   carries both its declared dimensions (shape) and its content digest
 *   (proof).
 *
 * fyd-media@2 (2026-09-21, managed-pipeline lane):
 * - RightsSource replaces the old authorized/external_reference/unknown
 *   vocabulary with an explicit source classification:
 *   business-provided | public-demo-source | unclear-reference-only.
 *   The classification is ENFORCED by the pipeline (ingest.ts refuses to
 *   acquire unclear-reference-only assets: reference retained, bytes never
 *   fetched, derivatives never generated), not just recorded.
 * - MediaVariant.derivedFrom names the original sha256 the variant was
 *   produced from: the derived-asset relationship is data, not convention.
 * - Rights basis sentences never imply FYD copyright ownership: caching or
 *   deriving an asset does not transfer rights.
 */

/**
 * Where FYD's right to hold/derive this asset comes from.
 *
 * business-provided: the business gave FYD the asset directly (owner
 *   upload / explicit provision). Strongest basis.
 * public-demo-source: public marketing imagery on the business's own site,
 *   acquired for the demo with the basis recorded. FYD claims NO
 *   copyright; the business (or its site licensor) retains all rights.
 * unclear-reference-only: authorization or provenance is unclear. The
 *   pipeline MUST NOT fetch, store, derive, or serve the bytes; the source
 *   reference is retained in the manifest observations only.
 */
export type RightsSource =
  | "business-provided"
  | "public-demo-source"
  | "unclear-reference-only";

/**
 * The single enforcement predicate for the pipeline. Every module that
 * decides whether an asset may be acquired, derived, bundled, or shown
 * goes through here; the vocabulary lives in exactly one place.
 */
export const ACQUIRABLE_RIGHTS: ReadonlySet<RightsSource> = new Set([
  "business-provided",
  "public-demo-source",
]);

export function isAcquirable(rightsSource: RightsSource): boolean {
  return ACQUIRABLE_RIGHTS.has(rightsSource);
}

export type FydMediaRole =
  | "hero"
  | "gallery"
  | "logo"
  | "card"
  | "service"
  | "team"
  | "location"
  | "project"
  | "thumbnail";

/**
 * Lifecycle states, adapted from PING MediaLifecycleState.
 * source_reference: URL observed, not yet fetched.
 * fetched: bytes on disk, not yet digested.
 * digested: content hash computed, deduped.
 * derivatives_ready: renditions generated.
 * published: served from the FYD derivative cache.
 * stale: source changed or disappeared since ingestion.
 */
export type MediaLifecycleState =
  | "source_reference"
  | "fetched"
  | "digested"
  | "derivatives_ready"
  | "published"
  | "stale";

export type MediaFormat = "webp" | "avif" | "jpeg" | "png";

export interface MediaProvenance {
  /** Exact URL the bytes were fetched from (final URL after redirects). */
  sourceUrl: string;
  /** Page where FYD observed the reference. */
  sourcePage: string;
  /** ISO 8601 observation time. */
  observedAt: string;
  /** Full redirect chain when the source redirected, first hop first. */
  redirectChain?: string[];
  /** Machine note, e.g. "302 gmail.com -> 404" for dead sources. */
  fetchNote?: string;
}

/**
 * One generated rendition. Shape (declared width/height/format) plus proof
 * (sha256 of the variant bytes), per the media-contracts harvest.
 * derivedFrom is the sha256 of the ORIGINAL bytes this variant was
 * produced from: the derived-asset relationship, explicit in data.
 */
export interface MediaVariant {
  /** "thumbnail" | "card" | "hero" | "w480" | "w768" | ... */
  name: string;
  width: number;
  height: number;
  format: MediaFormat;
  /** Public path, e.g. /fyd-media/<hash>/hero-1600w.webp */
  url: string;
  bytes: number;
  digest: string;
  /** SHA-256 of the original fetched bytes this variant was derived from. */
  derivedFrom: string;
}

export interface FydMediaObject {
  id: string;
  schema: "ping.social.media@1";
  title: string;
  mediaType: "image";
  roles: FydMediaRole[];
  rightsSource: RightsSource;
  /**
   * Human sentence stating the authorization basis. Never empty, and never
   * implies FYD owns the copyright: caching/deriving is not ownership.
   */
  rightsBasis: string;
  lifecycle: MediaLifecycleState;
  provenance: MediaProvenance;
  /** SHA-256 of the ORIGINAL fetched bytes. Dedupe key. */
  digest: string;
  originalFormat: string;
  width: number;
  height: number;
  variants: MediaVariant[];
  /** Object ids this media depicts or is associated with. */
  depicts: string[];
  altText: string | null;
  altTextSource: "source" | "generated" | "none";
  visibility: "public";
}

/** One fetch attempt, success or failure. The evidence trail. */
export interface MediaObservation {
  sourceUrl: string;
  sourcePage: string;
  observedAt: string;
  outcome: "ingested" | "failed" | "rejected" | "duplicate";
  reason?: string;
  digest?: string;
  redirectChain?: string[];
}

export interface MediaManifest {
  siteId: string;
  generatedAt: string;
  generator: string;
  observations: MediaObservation[];
  media: FydMediaObject[];
}

export const MEDIA_MODULE_VERSION = "fyd-media@2";
export const MEDIA_SCHEMA_ID = "ping.social.media@1";
