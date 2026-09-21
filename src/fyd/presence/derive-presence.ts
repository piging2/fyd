/**
 * H3 lane: data-derived visual presence for FYD demo sites.
 *
 * The two demo sites must look materially different because their SOURCE
 * MATERIAL and OBJECT GRAPHS differ, not because anyone hand-designed a
 * theme per site. This module is the entire per-site visual identity, and
 * it is a pure function of (object graph, media manifest):
 *
 *   - hero treatment: sites whose manifest carries hero-role media get a
 *     photographic hero; sites without one get a typographic brand band.
 *   - logo: the business's own ingested logo, or nothing.
 *   - gallery strip: the business's own gallery-role images, or nothing.
 *   - accent color + button radius: a stable hash of the owner object's
 *     graph identity (id + title) selects from ONE shared palette. No
 *     per-site assignment exists anywhere; different data selects
 *     differently, same data selects identically, forever.
 *
 * The palette itself is shared code (like the component registry). The
 * SELECTION is data. That is the whole distinction this module defends.
 */

import type { PingObject } from "@/lib/ping/types";
import {
  DEFAULT_FYD_THEME,
  type FYDThemeTokens,
  type ObjectGraph,
} from "../sitespec/types";
import type {
  FydMediaObject,
  MediaManifest,
  MediaVariant,
} from "../media/types";
import { isAcquirable } from "../media/types";
import { attachMediaToGraph, mediaForObject } from "../media/attach";

/** FNV-1a 32-bit. Deterministic across platforms; not cryptographic. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface AccentOption {
  accent: string;
  accentForeground: string;
}

/**
 * The one shared palette. Ordered, fixed, and identical for every site;
 * the hash picks the index. Adding a color changes every site's accent
 * only through the hash, never by assignment.
 */
const ACCENT_PALETTE: AccentOption[] = [
  { accent: "#B87333", accentForeground: "#1c1917" }, // copper
  { accent: "#2F6B4F", accentForeground: "#F7F5EF" }, // pine
  { accent: "#3B4A8C", accentForeground: "#F5F3EE" }, // indigo
  { accent: "#A63D2F", accentForeground: "#FAF6F0" }, // brick
  { accent: "#2E6E6A", accentForeground: "#F4F7F6" }, // slate teal
  { accent: "#C9A227", accentForeground: "#1c1917" }, // ochre (legacy default)
];

const MAX_GALLERY = 8;

/** Preferred display variant, largest sensible first. */
const VARIANT_PREFERENCE = [
  "hero",
  "card",
  "w768",
  "thumbnail",
  "w480",
  "w400",
  "w256",
];

export interface PresenceImage {
  /** FYD-served derivative URL (same origin, never a hotlink). */
  url: string;
  /** Tiny blur placeholder URL, or null when the manifest has none. */
  blurUrl: string | null;
  width: number;
  height: number;
  alt: string;
  /** sha256 of the ORIGINAL bytes. Dedupe/proof key. */
  digest: string;
  /** Where the bytes were fetched from (provenance, not a link target). */
  sourceUrl: string;
  observedAt: string;
}

export interface PresenceDerivation {
  /** The exact string hashed for the accent/radius selection. */
  accentSeed: string;
  accentIndex: number;
  heroKind: "image" | "typographic";
  radius: "md" | "full";
  acquiredCount: number;
  referenceOnlyCount: number;
  manifestGeneratedAt: string | null;
}

export interface Presence {
  siteId: string;
  businessName: string;
  tagline: string;
  logo: PresenceImage | null;
  hero: PresenceImage | null;
  gallery: PresenceImage[];
  themeTokens: FYDThemeTokens;
  derivation: PresenceDerivation;
}

function pickVariant(m: FydMediaObject): MediaVariant | null {
  for (const name of VARIANT_PREFERENCE) {
    const v = m.variants.find((v) => v.name === name);
    if (v) return v;
  }
  return m.variants[0] ?? null;
}

function toPresenceImage(m: FydMediaObject): PresenceImage | null {
  const v = pickVariant(m);
  if (!v) return null;
  const blur = m.variants.find((v) => v.name === "blur") ?? null;
  return {
    url: v.url,
    blurUrl: blur ? blur.url : null,
    width: v.width,
    height: v.height,
    alt: m.altText ?? m.title,
    digest: m.digest,
    sourceUrl: m.provenance.sourceUrl,
    observedAt: m.provenance.observedAt,
  };
}

/** Owner: public business object, lowest id wins ties (mirrors generator). */
function findOwner(graph: ObjectGraph): PingObject | null {
  const businesses = graph.objects
    .filter(
      (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return businesses[0] ?? null;
}

/**
 * Derive the site's presence from its object graph and media manifest.
 * Pure and total: null manifest or missing owner degrades gracefully,
 * never throws.
 */
export function derivePresence(
  graph: ObjectGraph,
  manifest: MediaManifest | null,
  siteId: string,
): Presence {
  const owner = findOwner(graph);
  const businessName = owner?.title?.trim() || siteId;
  const tagline = owner?.description?.trim() || "";

  // Semantic selection: the manifest is attached to the graph (Business
  // represented_by Media) and the selector walks those relationships
  // from the owner. The SET of media is the attachment's truth, never a
  // manifest scan; the rights gate still excludes reference-only assets.
  const manifestMedia = manifest?.media ?? [];
  const mediaGraph = manifest ? attachMediaToGraph(graph, manifest) : graph;
  const mediaById = new Map(manifestMedia.map((m) => [m.id, m]));
  const acquired = owner
    ? mediaForObject(mediaGraph, owner.id)
        .map((o) => mediaById.get(o.id))
        .filter(
          (m): m is FydMediaObject => !!m && isAcquirable(m.rightsSource),
        )
    : [];
  const referenceOnlyCount = manifestMedia.filter(
    (m) => !isAcquirable(m.rightsSource),
  ).length;

  const byId = (a: FydMediaObject, b: FydMediaObject) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const withRole = (role: string) =>
    acquired
      .filter((m) => m.roles.includes(role as FydMediaObject["roles"][number]))
      .sort(byId);

  const logoMedia = withRole("logo")[0] ?? null;
  const heroMedia = withRole("hero")[0] ?? null;
  const gallery = withRole("gallery")
    .slice(0, MAX_GALLERY)
    .map(toPresenceImage)
    .filter((g): g is PresenceImage => g !== null);

  // Accent + radius: pure function of the owner object's graph identity.
  // Same graph -> same identity; different graph -> (almost surely) different.
  const accentSeed = (owner ? owner.id + "|" + owner.title : siteId).toLowerCase();
  const accentIndex = fnv1a(accentSeed) % ACCENT_PALETTE.length;
  const radius = fnv1a(accentSeed + "|radius") % 2 === 0 ? "md" : "full";
  const chosen = ACCENT_PALETTE[accentIndex];
  const themeTokens: FYDThemeTokens = {
    ...DEFAULT_FYD_THEME,
    accent: chosen.accent,
    accentForeground: chosen.accentForeground,
    radius,
  };

  return {
    siteId,
    businessName,
    tagline,
    logo: logoMedia ? toPresenceImage(logoMedia) : null,
    hero: heroMedia ? toPresenceImage(heroMedia) : null,
    gallery,
    themeTokens,
    derivation: {
      accentSeed,
      accentIndex,
      heroKind: heroMedia ? "image" : "typographic",
      radius,
      acquiredCount: acquired.length,
      referenceOnlyCount,
      manifestGeneratedAt: manifest?.generatedAt ?? null,
    },
  };
}
