/**
 * acquireMedia: the single-entry FYD media acquisition path.
 *
 * TRACK A (2026-09-25, Nolan's media directive): the pipeline
 *
 *   SOURCE MEDIA -> FETCH (SSRF gate) -> VERIFY MIME/SIZE ->
 *   DIGEST ORIGINAL (sha256) -> PRESERVE SOURCE URL + OBSERVATION
 *   PROVENANCE -> SAFE DERIVATIVES -> FYD MEDIA OBJECT/REFERENCE ->
 *   SERVE FYD DERIVATIVE.
 *
 * This module is the ONE importable seam for acquiring media bytes. The
 * ingest pipeline (ingest.ts) and the fresh-URL acquisition track both
 * call acquireMedia(); nothing else fetches media. The reference it
 * returns (mediaRef, "fyd-media-<16 hex>") resolves to FYD-served
 * derivative URLs (/fyd-media/<sha256>/...) that every surface consumes
 * through the same selector (select.ts): website, Circle, feed, Ask FYD.
 *
 * OBJECT -> represented_by -> MEDIA; MEDIA -> observed_from -> SOURCE;
 * MEDIA -> derivative -> MEDIA_VARIANT: the media object carries the
 * source provenance, and each variant names the original digest it was
 * derived from (derivedFrom), so the lineage is data, not convention.
 *
 * AUTHORIZATION (demo scope, Nolan 2026-09-25): this module does NOT
 * decide authorization; the caller supplies an explicit rightsSource +
 * rightsBasis. Non-acquirable rights are rejected here, fail closed.
 * There is no universal public-media-mirroring policy anywhere in this
 * module. The demo ingest runner (run-ingest.ts) supplies the explicit
 * per-source demo authorization for the two authorized demo businesses.
 *
 * SECURITY: every fetch goes through the canonical SSRF gate
 * (src/fyd/net/safe-fetch.ts via ./safe-fetch): HTTP/HTTPS only, no
 * credentials in URLs, DNS resolved per hop, non-public address space
 * rejected (loopback, RFC1918, link-local incl. metadata endpoint,
 * CGNAT/tailnet, multicast), redirects re-validated per hop,
 * content-type allowlisted, size and timeout bounded. An arbitrary
 * caller-supplied URL can never become an unrestricted server-side
 * fetch through this module.
 *
 * Node-only (fs, sharp, node:crypto). Deterministic for identical
 * inputs: same bytes -> same digest -> same mediaRef -> same paths.
 */

import { generateDerivatives, hashContentBytes } from "./derivatives";
import { safeFetchImage } from "./safe-fetch";
import {
  MEDIA_SCHEMA_ID,
  isAcquirable,
  type FydMediaObject,
  type FydMediaRole,
  type MediaProvenance,
  type MediaVariant,
  type RightsSource,
} from "./types";

export interface AcquireMediaOptions {
  /** The URL to fetch. Always passes the SSRF gate; never fetched raw. */
  sourceUrl: string;
  /** Page (or snapshot) where FYD observed the reference. */
  sourcePage: string;
  /** ISO 8601 observation time; defaults to now. */
  observedAt?: string;
  /**
   * Explicit authorization classification. Must be acquirable
   * ("business-provided" | "public-demo-source"); anything else is
   * rejected here, fail closed. The demo ingest supplies the
   * demo-scoped authorization; this module never invents it.
   */
  rightsSource: RightsSource;
  /**
   * Human sentence stating the authorization basis. Never empty, and
   * never implies FYD owns the copyright: caching/deriving is not
   * ownership.
   */
  rightsBasis: string;
  /** Filesystem dir backing the public /fyd-media URL root. */
  publicDir: string;
  /** Public URL root for derivative URLs (default "/fyd-media"). */
  publicUrlRoot?: string;
  /** Display title; derived from the URL filename when omitted. */
  title?: string;
  /** Alt text from the source; null when the source had none. */
  alt?: string | null;
  /** Roles for the minted media object; default ["gallery"]. */
  roles?: FydMediaRole[];
}

export interface AcquiredMedia {
  /**
   * The servable media reference: "fyd-media-<16 hex of the original
   * digest>". Stable across surfaces: website, Circle, feed, Ask FYD
   * all resolve the same reference through select.ts.
   */
  mediaRef: string;
  /** SHA-256 of the ORIGINAL fetched bytes. Dedupe key. */
  digest: string;
  /** FYD-served derivatives (/fyd-media/<digest>/...), never hotlinks. */
  variants: MediaVariant[];
  /** Source URL (final after redirects) + observation provenance. */
  provenance: MediaProvenance;
  /** The minted FYD media object (schema ping.social.media@1). */
  media: FydMediaObject;
}

export type MediaAcquisitionFailureKind = "rights" | "fetch" | "derivatives";

/** Typed failure: every acquisition failure names its boundary. */
export class MediaAcquisitionError extends Error {
  readonly kind: MediaAcquisitionFailureKind;
  readonly reason: string;
  /** Redirect chain observed before the fetch failed (fetch kind only). */
  redirectChain?: string[];
  constructor(kind: MediaAcquisitionFailureKind, reason: string) {
    super("acquireMedia " + kind + ": " + reason);
    this.name = "MediaAcquisitionError";
    this.kind = kind;
    this.reason = reason;
  }
}

function titleFromUrl(url: string): string {
  let file = "";
  try {
    file = new URL(url).pathname.split("/").pop() ?? "";
  } catch {
    file = "";
  }
  const cleaned = file
    .replace(/[-_]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
  return cleaned.slice(0, 120) || "Site image";
}

/**
 * Acquire one media asset through the full safe path.
 *
 * Throws MediaAcquisitionError (kind "rights" | "fetch" |
 * "derivatives") on failure; never returns a partial asset. Failures
 * become ingest observations upstream, never exceptions that kill a
 * run.
 */
export async function acquireMedia(
  sourceUrl: string,
  opts: AcquireMediaOptions,
): Promise<AcquiredMedia> {
  // RIGHTS GATE: the caller asserts authorization explicitly. The
  // pipeline never acquires on an unclear or missing basis.
  if (!isAcquirable(opts.rightsSource)) {
    throw new MediaAcquisitionError(
      "rights",
      "rightsSource " + opts.rightsSource + " is not acquirable; bytes never fetched",
    );
  }
  if (!opts.rightsBasis || !opts.rightsBasis.trim()) {
    throw new MediaAcquisitionError(
      "rights",
      "rightsBasis must be a non-empty sentence stating the authorization basis",
    );
  }

  // FETCH through the SSRF gate: scheme, credentials, DNS per hop,
  // private-range rejection, redirect re-validation, content-type
  // allowlist, size/timeout bounds.
  const res = await safeFetchImage(sourceUrl);
  if (!res.ok) {
    const err = new MediaAcquisitionError("fetch", res.reason);
    err.redirectChain = res.redirectChain;
    throw err;
  }

  // DIGEST ORIGINAL: sha256 of the exact bytes, before any transform.
  const digest = hashContentBytes(res.bytes);

  // SAFE DERIVATIVES: bounded webp renditions into the FYD-managed,
  // content-addressed cache <publicDir>/<sha256>/...
  let gen: {
    variants: MediaVariant[];
    width: number;
    height: number;
    format: string;
  };
  try {
    gen = await generateDerivatives(
      res.bytes,
      digest,
      opts.publicDir,
      opts.publicUrlRoot,
    );
  } catch (e) {
    throw new MediaAcquisitionError(
      "derivatives",
      e instanceof Error ? e.message : String(e),
    );
  }

  const observedAt = opts.observedAt ?? new Date().toISOString();
  const provenance: MediaProvenance = {
    sourceUrl: res.finalUrl,
    sourcePage: opts.sourcePage,
    observedAt,
    redirectChain:
      res.redirectChain.length > 0 ? res.redirectChain : undefined,
  };

  const alt = opts.alt?.trim() ? opts.alt.trim().slice(0, 240) : null;
  const mediaRef = "fyd-media-" + digest.slice(0, 16);
  const media: FydMediaObject = {
    id: mediaRef,
    schema: MEDIA_SCHEMA_ID,
    title: (opts.title?.trim() || titleFromUrl(res.finalUrl)).slice(0, 120),
    mediaType: "image",
    roles: opts.roles && opts.roles.length > 0 ? opts.roles : ["gallery"],
    rightsSource: opts.rightsSource,
    rightsBasis: opts.rightsBasis.trim(),
    lifecycle: "published",
    provenance,
    digest,
    originalFormat: gen.format,
    width: gen.width,
    height: gen.height,
    variants: gen.variants,
    depicts: [],
    altText: alt,
    altTextSource: alt ? "source" : "none",
    visibility: "public",
  };

  return { mediaRef, digest, variants: gen.variants, provenance, media };
}

