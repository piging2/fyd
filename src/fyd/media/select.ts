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

function toDisplayMedia(m: FydMediaObject, heroBias: boolean): DisplayMedia | null {
  const v = heroBias ? pickHeroVariant(m.variants ?? []) : pickWidest(m.variants ?? []);
  if (!v) return null;
  const blur = m.variants.find((v) => v.name.startsWith("blur")) ?? null;
  return {
    id: m.id,
    role: m.roles?.[0] ?? "gallery",
    src: v.url,
    blurUrl: blur ? blur.url : null,
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
 * The hero media for an object: hero-role asset first, then other
 * photographic roles. NEVER a logo-role asset: a logo is brand identity,
 * not a photographic hero, and must never be stretched into a banner.
 * Null when the object has no photographic acquired media (the caller
 * renders its typographic fallback).
 *
 * Scope: the sort in select() still leads galleries with logos (the
 * object view wants the brand mark first); this filter is hero-only.
 */
export function heroMediaFor(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
): DisplayMedia | null {
  const all = select(siteId, graph, objectId, true);
  // DisplayMedia.role is the asset's first role; the ingest roleFor()
  // mints "logo" only as a sole role, so a first-role check is complete.
  const photographic = all.filter((d) => d.role !== "logo");
  return photographic.find((d) => d.role === "hero") ?? photographic[0] ?? null;
}

/**
 * Gallery media for an object (2026-09-22 compose lane): the acquired
 * photographic assets that belong on a gallery surface. Logos, heroes,
 * and small card/thumbnail renditions are excluded: the hero has its own
 * surface, a logo is brand identity, and thumbnails are derivatives, not
 * gallery pieces. Stable content-driven order from select(). Empty
 * (never null) when the object has no gallery media: the Gallery section
 * renders nothing in that case.
 */
export function galleryMediaFor(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
): DisplayMedia[] {
  const EXCLUDED_ROLES = new Set(["logo", "hero", "card", "thumbnail"]);
  return select(siteId, graph, objectId, false).filter(
    (d) => !EXCLUDED_ROLES.has(d.role),
  );
}
