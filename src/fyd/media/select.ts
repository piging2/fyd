/**
 * FYD media display selection (server-only: node:fs).
 *
 * The ONE selector every surface uses to resolve "which media does this
 * object show": Page, Circle, ObjectView, and later feed/social/agent
 * context. Selection is SEMANTIC: the manifest store is attached to the
 * object graph (attach.ts: Business represented_by Media, Service
 * illustrated_by Media, Project has_media Media) and the selector walks
 * those relationships from the object. Media follows its object; it is
 * never assigned to a page slot.
 *
 * The manifest is read from disk on every call (freshness outranks the
 * memo: a re-ingest is visible immediately, no restart). Deterministic:
 * no network, no mutation.
 */

import type { ObjectGraph } from "../sitespec/types";
import { attachMediaToGraph, mediaForObject } from "./attach";
import { getPipelineManifest } from "./bundle-media";
import { resolveSafeLink } from "../sitespec/safe-link";
import { isGalleryEligible } from "./richness";
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import sharp from "sharp";
import {
  isAcquirable,
  type FydMediaObject,
  type MediaManifest,
  type MediaVariant,
  type RightsSource,
} from "./types";

export interface DisplayMedia {
  id: string;
  /** First role: logo | hero | gallery | ... */
  role: string;
  /** Display derivative URL (FYD-served, same origin, never a hotlink). */
  src: string;
  /** Tiny blur placeholder URL, or null. */
  blurUrl: string | null;
  width: number;
  height: number;
  alt: string;
  rightsSource: RightsSource;
  rightsBasis: string;
  sourceUrl: string;
  digest: string;
  observedAt: string;
}

/**
 * Read the pipeline manifest for a site from the read-model-adjacent
 * store. Null when the site has no manifest (never throws: missing data
 * is not a failure of the selector). Fresh on every call: a re-ingest is
 * visible immediately, no restart.
 */
export function readPipelineManifest(siteId: string): MediaManifest | null {
  return getPipelineManifest(siteId);
}

/** Widest non-blur variant: the honest "best" rendition for display. */
function pickWidest(variants: MediaVariant[]): MediaVariant | null {
  const real = variants.filter((v) => !v.name.startsWith("blur"));
  if (real.length === 0) return null;
  return real.reduce((a, b) => (b.width > a.width ? b : a));
}

/** Named-variant preference for hero surfaces (largest sensible first). */
const HERO_PREFERENCE = ["hero", "card", "w768", "thumbnail", "w480"];

function pickHeroVariant(variants: MediaVariant[]): MediaVariant | null {
  for (const name of HERO_PREFERENCE) {
    const v = variants.find((v) => v.name === name);
    if (v) return v;
  }
  return pickWidest(variants);
}

/**
 * Render-seam gate for display URLs. The pipeline mints same-origin paths
 * (/fyd-media/<hash>/file); anything else must clear the shared
 * resolveSafeLink allowlist (http/https, parser-based). Returns null for
 * anything unsafe: the caller then renders its no-media fallback.
 */
function safeDisplayUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  // Same-origin path: no scheme, no host, no whitespace/control chars.
  if (/^\/[^\s\\]*$/.test(raw) && !/^\/\//.test(raw)) return raw;
  const r = resolveSafeLink(raw, "navigate");
  return r.kind === "safe" ? r.href : null;
}

function toDisplayMedia(m: FydMediaObject, heroBias: boolean): DisplayMedia | null {
  const v = heroBias ? pickHeroVariant(m.variants ?? []) : pickWidest(m.variants ?? []);
  if (!v) return null;
  const src = safeDisplayUrl(v.url);
  if (!src) return null;
  const blur = m.variants.find((v) => v.name.startsWith("blur")) ?? null;
  const blurUrl = blur ? safeDisplayUrl(blur.url) : null;
  return {
    id: m.id,
    role: m.roles?.[0] ?? "gallery",
    src,
    blurUrl,
    width: v.width,
    height: v.height,
    alt: (m.altText ?? "").trim() || m.title || "Business photo",
    rightsSource: m.rightsSource,
    rightsBasis: m.rightsBasis ?? "",
    sourceUrl: m.provenance?.sourceUrl ?? "",
    digest: m.digest ?? "",
    observedAt: m.provenance?.observedAt ?? "",
  };
}

function select(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
  heroBias: boolean,
): DisplayMedia[] {
  const manifest = readPipelineManifest(siteId);
  if (!manifest) return [];
  const mediaGraph = attachMediaToGraph(graph, manifest);
  const byId = new Map(manifest.media.map((m) => [m.id, m]));
  const out: DisplayMedia[] = [];
  for (const o of mediaForObject(mediaGraph, objectId)) {
    const m = byId.get(o.id);
    if (!m || !isAcquirable(m.rightsSource)) continue;
    const d = toDisplayMedia(m, heroBias);
    if (d) out.push(d);
  }
  // Logos first, then heroes, then gallery: stable, content-driven order.
  const roleRank = (r: string) => (r === "logo" ? 0 : r === "hero" ? 1 : 2);
  out.sort(
    (a, b) => roleRank(a.role) - roleRank(b.role || "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return out;
}

/**
 * Every displayable media for an object, via the semantic attachment.
 * This is what ObjectView.media and gallery surfaces consume.
 */
export function listObjectMedia(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
): DisplayMedia[] {
  return select(siteId, graph, objectId, false);
}

/**
 * The hero media for an object: hero-role asset first, then the
 * composition-fitness fallback. NEVER a logo-role asset: a logo is brand
 * identity, not a photographic hero, and must never be stretched into a
 * banner. Null when the object has no photographic acquired media (the
 * caller renders its typographic fallback).
 *
 * Scope: the sort in select() still leads galleries with logos (the
 * object view wants the brand mark first); this filter is hero-only.
 *
 * Async: the fallback ranking measures mean luminance from each
 * candidate's tiny blur derivative (sharp, server-only). A missing or
 * unreadable blur degrades to aspect+resolution ranking, never to a
 * failure.
 */
export async function heroMediaFor(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
): Promise<DisplayMedia | null> {
  const all = select(siteId, graph, objectId, true);
  // DisplayMedia.role is the asset's first role; the ingest roleFor()
  // mints "logo" only as a sole role, so a first-role check is complete.
  const photographic = all.filter((d) => d.role !== "logo");
  const explicit = photographic.find((d) => d.role === "hero");
  if (explicit) return explicit;
  return rankFallbackHero(photographic);
}

/**
 * Polish lane (2026-09-26): composition-fitness ranking for the fallback
 * hero (no explicit hero-role asset). Ingest order is not a composition
 * decision: the manifest's first asset was the dark pipe-frame that the
 * 2026-09-26 falsifier caught stretched into the HPP banner.
 *
 * Fitness is measurable, in this order:
 * 1. Hero-slot aspect fit: the slot is full-bleed landscape (16/9
 *    target). Candidates closer to the target aspect win; portrait
 *    frames are penalized hard (a 3:4 phone photo is not a banner).
 * 2. Mean luminance sufficient for overlaid type, measured from the
 *    candidate's tiny blur derivative: near-black frames (< 0.12 mean
 *    relative luminance) are deprioritized hard.
 * 3. Resolution as a tiebreak-scale nudge only: larger frames carry more
 *    detail full-bleed, but size never outranks composition.
 *
 * Deterministic: same manifest bytes -> same ranking (id is the final
 * tiebreak). A missing or unreadable blur degrades that candidate to
 * aspect+resolution ranking; luminance is a bonus signal, never a gate.
 */
const HERO_TARGET_ASPECT = 16 / 9;
/** Mean relative luminance below this is a near-black frame. */
const NEAR_BLACK_LUMINANCE = 0.12;

/** WCAG relative luminance of one sRGB pixel. */
function srgbLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Mean relative luminance of the candidate's tiny blur derivative.
 * Null when the blur is absent, off-disk, or undecodable: the caller
 * ranks on aspect+resolution instead. Memoized per blur URL (the
 * pipeline mints content-addressed URLs, so a URL change means new
 * bytes).
 */
const luminanceMemo = new Map<string, number | null>();

async function meanBlurLuminance(blurUrl: string | null): Promise<number | null> {
  if (!blurUrl || !blurUrl.startsWith("/") || blurUrl.startsWith("//")) return null;
  const hit = luminanceMemo.get(blurUrl);
  if (hit !== undefined) return hit;
  let lum: number | null = null;
  try {
    const publicDir = normalize(join(process.cwd(), "public"));
    const disk = normalize(join(publicDir, blurUrl.slice(1)));
    // Path-traversal guard: the blur must resolve under /public.
    if (disk === publicDir || disk.startsWith(publicDir + "/")) {
      const raw = await sharp(readFileSync(disk)).resize(1, 1, { fit: "inside" }).raw().toBuffer();
      if (raw.length >= 3) lum = srgbLuminance(raw[0], raw[1], raw[2]);
    }
  } catch {
    lum = null;
  }
  luminanceMemo.set(blurUrl, lum);
  return lum;
}

async function rankFallbackHero(candidates: DisplayMedia[]): Promise<DisplayMedia | null> {
  if (candidates.length === 0) return null;
  const scored = await Promise.all(
    candidates.map(async (d) => {
      const w = Math.max(1, d.width);
      const h = Math.max(1, d.height);
      const aspect = w / h;
      // Aspect fit: 1.0 at the 16/9 target, decaying with log distance.
      const aspectFit = 1 / (1 + Math.abs(Math.log2(aspect / HERO_TARGET_ASPECT)));
      // Portrait frames are not banners.
      const orientationFactor = aspect >= 1 ? 1 : 0.4;
      const lum = await meanBlurLuminance(d.blurUrl);
      // Near-black frames cannot carry overlaid type: deprioritize hard.
      // Unmeasured blurs rank neutrally (0.8): luminance is a bonus
      // signal, never a gate.
      const luminanceFactor =
        lum === null ? 0.8 : lum < NEAR_BLACK_LUMINANCE ? 0.05 : 0.6 + 0.4 * lum;
      // Resolution tiebreak only: it must never outrank composition.
      const resolutionNudge = 1 + Math.log10(w * h) / 100;
      return { d, score: aspectFit * orientationFactor * luminanceFactor * resolutionNudge };
    }),
  );
  scored.sort(
    (a, b) => b.score - a.score || (a.d.id < b.d.id ? -1 : a.d.id > b.d.id ? 1 : 0),
  );
  return scored[0]?.d ?? null;
}

/**
 * Gallery media for an object (2026-09-22 compose lane): the acquired
 * photographic assets that belong on a gallery surface. Logos, heroes,
 * and small card/thumbnail renditions are excluded: the hero has its own
 * surface, a logo is brand identity, and thumbnails are derivatives, not
 * gallery pieces. The gallery dimension gate (media-intelligence lane 5,
 * 2026-09-26) additionally excludes tiny brand-badge assets: a gallery
 * grid shows photographs, and the 118-200px manufacturer badges in the
 * Coppersmith manifest are not photographs. Stable content-driven order
 * from select(). Empty (never null) when the object has no gallery
 * media: the Gallery section renders nothing in that case.
 */
export function galleryMediaFor(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
): DisplayMedia[] {
  const EXCLUDED_ROLES = new Set(["logo", "hero", "card", "thumbnail"]);
  const manifest = readPipelineManifest(siteId);
  const byId = new Map((manifest?.media ?? []).map((m) => [m.id, m]));
  return select(siteId, graph, objectId, false).filter(
    (d) =>
      !EXCLUDED_ROLES.has(d.role) && isGalleryEligible(byId.get(d.id)),
  );
}
