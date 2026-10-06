/**
 * FYD media ingestion orchestrator.
 *
 * SOURCE REFERENCE -> RIGHTS GATE -> SAFE FETCH -> DIGEST ->
 * MEDIA OBSERVATION -> FYD DERIVATIVES -> MEDIA OBJECT (+ manifest) -> RENDER.
 *
 * For each discovered image reference:
 * - classify rights FIRST (discover.ts), before any bytes move. Assets
 *   classified unclear-reference-only are REJECTED here: the source
 *   reference is retained in the observations, but no bytes are fetched,
 *   no derivatives are generated, and no media object is minted. This is
 *   the pipeline's rights enforcement: unclear provenance is never
 *   silently republished as FYD media.
 * - fetch through the SSRF gate (safe-fetch.ts); failures become
 *   MediaObservations with reasons, never exceptions that kill the run;
 * - digest bytes (sha256); dedupe by digest across pages and runs;
 * - generate bounded derivatives (derivatives.ts) into the FYD-managed
 *   cache: <publicDir>/<sha256>/...;
 * - mint a FydMediaObject with full provenance and rights classification;
 * - assign roles: the business's own logo -> logo; the largest
 *   landscape image -> hero candidate; the rest -> gallery.
 *
 * The fetch -> digest -> derivatives -> mint core lives in
 * acquire-media.ts (the single-entry acquisition path). ingest.ts owns
 * discovery, rights classification, dedupe, role assignment, and the
 * manifest; it never fetches bytes itself.
 *
 * DEMO-AUTHORIZED SOURCES (Nolan 2026-09-25): for the authorized demo
 * businesses, the runner may pass explicit `authorizedSources` with an
 * `authorizedBasis` sentence. These skip the generic rights heuristic
 * because the authorization is explicit, recorded in provenance, and
 * demo-scoped; they still pass the SSRF gate, digest, and derivative
 * bounds exactly like discovered refs. This is NOT a general
 * public-media-mirroring policy: authorization is asserted per source,
 * never inferred.
 *
 * Writes <manifestPath> (MediaManifest JSON): every observation,
 * including failures and rejections, plus every minted media object.
 * Deterministic for identical inputs: same bytes -> same digest ->
 * same paths; media ids derive from the digest.
 *
 * Node-only (uses fs, sharp, node:crypto). Run via tsx on the build host.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { acquireMedia, MediaAcquisitionError } from "./acquire-media";
import { attachMediaToGraph } from "./attach";
import { classifyRights, discoverImages, type DiscoveredImage } from "./discover";
import { safeFetchPage } from "./safe-fetch";
import {
  MEDIA_MODULE_VERSION,
  isAcquirable,
  type FydMediaObject,
  type FydMediaRole,
  type MediaManifest,
  type MediaObservation,
  type RightsSource,
} from "./types";

/**
 * One explicitly demo-authorized acquisition source.
 *
 * Used when the business's own site is unreachable but its public
 * marketing media is known (e.g. the live origin redirects, and the
 * business's own public asset URLs were observed on its own site
 * snapshot). The authorization basis is asserted by the runner
 * (run-ingest.ts) and recorded verbatim in provenance; the heuristic
 * classifier is never consulted for these.
 */
export interface AuthorizedSource {
  /** Exact URL to acquire. */
  url: string;
  /** Display title; derived from the URL filename when omitted. */
  title?: string;
  /** Alt text from the source; null when the source had none. */
  alt?: string | null;
  /** Provenance page override; defaults to authorizedSourcePage. */
  sourcePage?: string;
}

export interface IngestOptions {
  siteId: string;
  /** Lowercased business slug for rights classification, e.g. "coppersmith". */
  businessSlug: string;
  /** Pages to discover images from. */
  pages: string[];
  /** Filesystem dir backing the public /fyd-media URL root. */
  publicDir: string;
  /** Where to write the manifest JSON. */
  manifestPath: string;
  /** Cap on images ingested per site (safety bound). */
  maxImages?: number;
  /**
   * Experimental/preview run: the manifest is stamped preview: true and
   * the caller must write it outside the production manifests dir
   * (run-ingest.ts --preview). The read path never serves a
   * preview-marked manifest as production truth.
   */
  preview?: boolean;
  /**
   * Explicit demo-authorized sources (Nolan 2026-09-25, authorized demo
   * businesses only). Requires authorizedBasis; throws when absent.
   */
  authorizedSources?: AuthorizedSource[];
  /**
   * The explicit authorization sentence recorded as rightsBasis for
   * every authorized source. Must name the authorization (who/when)
   * and the scope (demo only); never implies FYD copyright ownership.
   */
  authorizedBasis?: string;
  /** Provenance page for authorized sources; defaults to pages[0]. */
  authorizedSourcePage?: string;
}

function businessOrigin(pages: string[]): string {
  return new URL(pages[0]).origin;
}

function roleFor(file: string, width: number, height: number, isFirstLarge: boolean): FydMediaRole[] {
  const f = file.toLowerCase();
  if (/logo/.test(f)) return ["logo"];
  if (isFirstLarge && width >= 800 && height > 0 && width / height > 1.2) return ["hero", "gallery"];
  return ["gallery"];
}

/**
 * Acquire one URL through the single-entry path (acquire-media.ts).
 * Appends the observation (ingested/duplicate/failed/rejected) and
 * returns the minted media object with roles NOT yet assigned, or null
 * when nothing was acquired. Failures are observations, never throws
 * (except unexpected programmer errors).
 */
async function acquireOne(
  url: string,
  source: {
    page: string;
    observedAt: string;
    rightsSource: RightsSource;
    basis: string;
    alt: string | null;
    title?: string;
    demoNote?: string;
  },
  opts: IngestOptions,
  seenDigests: Map<string, string>,
  observations: MediaObservation[],
): Promise<FydMediaObject | null> {
  let media: FydMediaObject;
  let redirectChain: string[] | undefined;
  try {
    const acq = await acquireMedia(url, {
      sourceUrl: url,
      sourcePage: source.page,
      observedAt: source.observedAt,
      rightsSource: source.rightsSource,
      rightsBasis: source.basis,
      publicDir: opts.publicDir,
      alt: source.alt,
      title: source.title,
    });
    media = acq.media;
    redirectChain = acq.provenance.redirectChain;
  } catch (e) {
    const err = e instanceof MediaAcquisitionError ? e : null;
    const reason = err ? err.kind + ": " + err.reason : "unexpected: " + String(e);
    redirectChain = err?.redirectChain;
    // Rejected: the pipeline refused to acquire (rights, or the SSRF /
    // content-type gate rejected the URL before bytes moved). Failed:
    // transport or derivative errors.
    const outcome =
      err?.kind === "rights" ||
      (err?.kind === "fetch" &&
        /^(URL rejected|DNS rejected|Content-type)/.test(err.reason))
        ? "rejected"
        : "failed";
    observations.push({
      sourceUrl: url,
      sourcePage: source.page,
      observedAt: source.observedAt,
      outcome,
      reason,
      redirectChain,
    });
    return null;
  }
  if (seenDigests.has(media.digest)) {
    observations.push({
      sourceUrl: url,
      sourcePage: source.page,
      observedAt: source.observedAt,
      outcome: "duplicate",
      reason: "Identical bytes already ingested as " + seenDigests.get(media.digest),
      digest: media.digest,
      redirectChain,
    });
    return null;
  }
  seenDigests.set(media.digest, media.id);
  observations.push({
    sourceUrl: url,
    sourcePage: source.page,
    observedAt: source.observedAt,
    outcome: "ingested",
    reason: source.demoNote,
    digest: media.digest,
    redirectChain,
  });
  return media;
}

export async function ingestSiteMedia(opts: IngestOptions): Promise<MediaManifest> {
  const maxImages = opts.maxImages ?? 40;
  const origin = businessOrigin(opts.pages);
  const observations: MediaObservation[] = [];
  const media: FydMediaObject[] = [];
  const seenDigests = new Map<string, string>(); // digest -> media id
  const now = new Date().toISOString();
  let heroAssigned = false;

  const authorized = opts.authorizedSources ?? [];
  if (authorized.length > 0 && !(opts.authorizedBasis ?? "").trim()) {
    // Fail closed: explicit demo authorization is asserted, never assumed.
    throw new Error(
      "ingestSiteMedia: authorizedSources requires a non-empty authorizedBasis " +
        "(explicit demo authorization; see Nolan 2026-09-25 media directive)",
    );
  }

  const discovered: { ref: DiscoveredImage; page: string }[] = [];
  for (const page of opts.pages) {
    const res = await safeFetchPage(page);
    if (!res.ok) {
      observations.push({
        sourceUrl: page,
        sourcePage: page,
        observedAt: now,
        outcome: "failed",
        reason: "Page fetch failed: " + res.reason,
        redirectChain: res.redirectChain,
      });
      continue;
    }
    const html = Buffer.from(res.bytes).toString("utf8");
    for (const ref of discoverImages(html, res.finalUrl)) {
      discovered.push({ ref, page: res.finalUrl });
    }
  }

  let ingested = 0;
  /** Assign roles (logo/hero/gallery) and append to the manifest. */
  const place = (m: FydMediaObject) => {
    const file = new URL(m.provenance.sourceUrl).pathname.split("/").pop() ?? "";
    const roles = roleFor(file, m.width, m.height, !heroAssigned);
    if (roles.includes("hero")) heroAssigned = true;
    m.roles = roles;
    media.push(m);
    ingested++;
  };

  for (const { ref, page } of discovered) {
    if (ingested >= maxImages) break;
    const observedAt = new Date().toISOString();
    // RIGHTS GATE: classify before any bytes move. Unclear provenance is
    // never acquired, derived, or served; the reference is retained only.
    const { rightsSource, basis } = classifyRights(ref.url, opts.businessSlug, origin);
    if (!isAcquirable(rightsSource)) {
      observations.push({
        sourceUrl: ref.url,
        sourcePage: page,
        observedAt,
        outcome: "rejected",
        reason: "Rights gate (" + rightsSource + "): " + basis,
      });
      continue;
    }
    const m = await acquireOne(
      ref.url,
      { page, observedAt, rightsSource, basis, alt: ref.alt },
      opts,
      seenDigests,
      observations,
    );
    if (m) place(m);
  }

  // DEMO-AUTHORIZED SOURCES: the authorization is explicit and recorded
  // in provenance (authorizedBasis), never inferred by the heuristic.
  // SSRF gate, digest, and derivative bounds apply identically.
  for (const src of authorized) {
    if (ingested >= maxImages) break;
    const observedAt = new Date().toISOString();
    const m = await acquireOne(
      src.url,
      {
        page: src.sourcePage ?? opts.authorizedSourcePage ?? opts.pages[0],
        observedAt,
        rightsSource: "public-demo-source",
        basis: (opts.authorizedBasis ?? "").trim(),
        alt: src.alt ?? null,
        title: src.title,
        demoNote: "Demo-authorized source (Nolan 2026-09-25)",
      },
      opts,
      seenDigests,
      observations,
    );
    if (m) place(m);
  }

  const manifest: MediaManifest = {
    siteId: opts.siteId,
    generatedAt: now,
    generator: MEDIA_MODULE_VERSION,
    // Production-truth provenance: the read path requires these. A
    // preview run is marked AND written outside the production manifests
    // dir (run-ingest.ts): two independent reasons the read path can
    // never serve it as production truth.
    ingestRunId: randomUUID(),
    pipelineVersion: MEDIA_MODULE_VERSION,
    preview: opts.preview === true,
    observations,
    media,
  };
  await mkdir(dirname(opts.manifestPath), { recursive: true });
  await writeFile(opts.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export { attachMediaToGraph };
