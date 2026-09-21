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
 * Writes <manifestPath> (MediaManifest JSON): every observation,
 * including failures and rejections, plus every minted media object.
 * Deterministic for identical inputs: same bytes -> same digest ->
 * same paths; media ids derive from the digest.
 *
 * Node-only (uses fs, sharp, node:crypto). Run via tsx on the build host.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { attachMediaToGraph } from "./attach";
import { classifyRights, discoverImages, type DiscoveredImage } from "./discover";
import { generateDerivatives, hashContentBytes } from "./derivatives";
import { safeFetchImage, safeFetchPage } from "./safe-fetch";
import {
  MEDIA_MODULE_VERSION,
  isAcquirable,
  type FydMediaObject,
  type FydMediaRole,
  type MediaManifest,
  type MediaObservation,
} from "./types";

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

export async function ingestSiteMedia(opts: IngestOptions): Promise<MediaManifest> {
  const maxImages = opts.maxImages ?? 40;
  const origin = businessOrigin(opts.pages);
  const observations: MediaObservation[] = [];
  const media: FydMediaObject[] = [];
  const seenDigests = new Map<string, string>(); // digest -> media id
  const now = new Date().toISOString();
  let heroAssigned = false;

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
    const res = await safeFetchImage(ref.url);
    if (!res.ok) {
      observations.push({
        sourceUrl: ref.url,
        sourcePage: page,
        observedAt,
        outcome: res.reason.startsWith("URL rejected") || res.reason.startsWith("DNS rejected") || res.reason.startsWith("Content-type") ? "rejected" : "failed",
        reason: res.reason,
        redirectChain: res.redirectChain,
      });
      continue;
    }
    const digest = hashContentBytes(res.bytes);
    if (seenDigests.has(digest)) {
      observations.push({
        sourceUrl: ref.url,
        sourcePage: page,
        observedAt,
        outcome: "duplicate",
        reason: "Identical bytes already ingested as " + seenDigests.get(digest),
        digest,
        redirectChain: res.redirectChain,
      });
      continue;
    }

    const id = "fyd-media-" + digest.slice(0, 16);
    let gen;
    try {
      gen = await generateDerivatives(res.bytes, digest, opts.publicDir);
    } catch (e) {
      observations.push({
        sourceUrl: ref.url,
        sourcePage: page,
        observedAt,
        outcome: "failed",
        reason: "Derivative generation failed: " + (e instanceof Error ? e.message : String(e)),
        digest,
        redirectChain: res.redirectChain,
      });
      continue;
    }

    const file = new URL(res.finalUrl).pathname.split("/").pop() ?? "";
    const roles = roleFor(file, gen.width, gen.height, !heroAssigned);
    if (roles.includes("hero")) heroAssigned = true;
    const title = (ref.alt && ref.alt.trim()) || file.replace(/[-_]/g, " ").replace(/\.[a-z0-9]+$/i, "") || "Site image";

    media.push({
      id,
      schema: "ping.social.media@1",
      title: title.slice(0, 120),
      mediaType: "image",
      roles,
      rightsSource,
      rightsBasis: basis,
      lifecycle: "published",
      provenance: {
        sourceUrl: res.finalUrl,
        sourcePage: page,
        observedAt,
        redirectChain: res.redirectChain.length > 0 ? res.redirectChain : undefined,
      },
      digest,
      originalFormat: gen.format,
      width: gen.width,
      height: gen.height,
      variants: gen.variants,
      depicts: [],
      altText: ref.alt?.trim() ? ref.alt.trim().slice(0, 240) : null,
      altTextSource: ref.alt?.trim() ? "source" : "none",
      visibility: "public",
    });
    seenDigests.set(digest, id);
    observations.push({ sourceUrl: ref.url, sourcePage: page, observedAt, outcome: "ingested", digest, redirectChain: res.redirectChain });
    ingested++;
  }

  const manifest: MediaManifest = {
    siteId: opts.siteId,
    generatedAt: now,
    generator: MEDIA_MODULE_VERSION,
    observations,
    media,
  };
  await mkdir(dirname(opts.manifestPath), { recursive: true });
  await writeFile(opts.manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export { attachMediaToGraph };
