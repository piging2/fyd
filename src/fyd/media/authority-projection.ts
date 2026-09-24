/**
 * Projection stage (fyd-media@2 lane-media): PING media authority -> display.
 *
 * The factory media stage is a THIN CONSUMER of the PING media
 * authorities. This module is the projection seam: it resolves "which
 * media does this object show" by joining the pipeline's evidence
 * (the manifest: rights, provenance, semantic attachment) with the
 * authority's serving truth (the public media gate in
 * src/lib/media.ts). An asset the gate does not approve is never
 * projected: fail-closed, exactly like the authority itself.
 *
 * Pipeline position: discover -> observe -> evidence -> digest ->
 * derivative -> media binding (authority-binding.ts) -> PROJECTION
 * (this module). Selection is semantic (attach.ts: media follows its
 * object, never a page slot) and deterministic: same graph + same
 * manifest + same authority records -> same projection, byte for byte.
 *
 * The hero resolution honors the owner's recorded selection when it is
 * valid (validated, not trusted), mirroring the owner-hero.ts seam but
 * resolving through the authority gate instead of the disk manifest.
 * When no approved media exists, the hero resolves to a generated
 * treatment (generated-treatment.ts): never a broken image, never an
 * invented photograph.
 *
 * Authority access is dependency-injected; production callers omit
 * `deps` and get the real public gate via lazy import.
 */

import type { Media, MediaVariants } from "../../types/media";
import type { ObjectGraph } from "../sitespec/types";
import { attachMediaToGraph, mediaForObject } from "./attach";
import {
  generatedTreatmentFor,
  type GeneratedTreatment,
} from "./generated-treatment";
import { isAcquirable, type FydMediaObject, type MediaManifest } from "./types";
import type { DisplayMedia } from "./select";

/** The authority surface the projection consumes. Inject for tests. */
export interface ProjectionDeps {
  /**
   * The PING public media gate. Returns the approved PublishedMediaAsset
   * or null when the authority does not approve the id for public
   * presentation (missing, stale, drive-backed, or unverifiable).
   */
  resolvePublicMedia: (id: string) => Promise<Media | null>;
}

async function defaultProjectionDeps(): Promise<ProjectionDeps> {
  // Lazy: importing this module never touches the network.
  const authority = (await import("../../lib/media")) as {
    resolvePublicMedia: ProjectionDeps["resolvePublicMedia"];
  };
  return {
    resolvePublicMedia: (id) => authority.resolvePublicMedia(id),
  };
}

export type AuthorityHeroBasis = "owner" | "auto" | "owner-fallback";

export interface AuthorityHeroResolution {
  /** The media to render (null: the caller renders the generated treatment). */
  media: DisplayMedia | null;
  /** "owner": the owner's pick won. "auto": no owner pick given.
   *  "owner-fallback": an owner pick was given but could not be honored. */
  basis: AuthorityHeroBasis;
  /** The owner-selected media id as passed in, or null. */
  ownerSelectedId: string | null;
  /** Human/machine sentence describing the resolution. Never empty. */
  note: string;
}

export interface HeroProjection {
  /** Approved hero media, or null when there is none. */
  media: DisplayMedia | null;
  /** Generated treatment, exactly when media is null. Never both null, never both set. */
  treatment: GeneratedTreatment | null;
  basis: AuthorityHeroBasis;
  note: string;
}

/** Widest sensible public variant URL, or null when the record serves nothing usable. */
function pickPublicSrc(record: Media): string | null {
  const variants = (record as { variants?: MediaVariants }).variants;
  if (!variants) return null;
  for (const url of [variants.webp, variants.original]) {
    if (typeof url !== "string" || url.length === 0) continue;
    // Defense in depth: the authority gate rejects drive URLs, and the
    // projection never serves one even if a record somehow carried it.
    if (url.startsWith("/api/drive/")) continue;
    return url;
  }
  return null;
}

function toDisplayMedia(
  entry: FydMediaObject,
  record: Media,
  src: string,
): DisplayMedia {
  const published = record as {
    dimensions?: { width: number; height: number };
    variants?: MediaVariants;
    alt?: string;
    roles?: string[];
  };
  const blur =
    typeof published.variants?.blur === "string" ? published.variants.blur : null;
  return {
    id: record.id,
    role: published.roles?.[0] ?? entry.roles?.[0] ?? "gallery",
    // src is ALWAYS authority-issued. The pipeline's sourceUrl (the
    // origin page's hotlink) is evidence only and is never served.
    src,
    blurUrl: blur,
    width: published.dimensions?.width ?? entry.width,
    height: published.dimensions?.height ?? entry.height,
    alt:
      (published.alt ?? "").trim() ||
      (entry.altText ?? "").trim() ||
      entry.title ||
      "Business photo",
    rightsSource: entry.rightsSource,
    rightsBasis: entry.rightsBasis ?? "",
    sourceUrl: entry.provenance?.sourceUrl ?? "",
    digest: entry.digest ?? "",
    observedAt: entry.provenance?.observedAt ?? "",
  };
}

/** The authority gate, fail-closed: a throwing gate is an unapproved asset. */
async function approvedMedia(
  deps: ProjectionDeps,
  id: string,
): Promise<Media | null> {
  try {
    return await deps.resolvePublicMedia(id);
  } catch {
    return null;
  }
}

/**
 * Every displayable media for an object, projected through the PING
 * authority gate. The manifest is the evidence join (rights, provenance,
 * alt); the authority record is the serving truth (public URLs,
 * dimensions). An asset the gate rejects is excluded, never served.
 * Deterministic: ascending id order, stable role ranking.
 */
export async function projectObjectMedia(
  graph: ObjectGraph,
  manifest: MediaManifest | null,
  objectId: string,
  deps?: ProjectionDeps,
): Promise<DisplayMedia[]> {
  if (!manifest) return [];
  const d = deps ?? (await defaultProjectionDeps());
  const augmented = attachMediaToGraph(graph, manifest);
  const attached = mediaForObject(augmented, objectId);
  const byId = new Map(manifest.media.map((m) => [m.id, m]));
  const out: DisplayMedia[] = [];
  for (const o of attached) {
    const entry = byId.get(o.id);
    if (!entry || !isAcquirable(entry.rightsSource)) continue;
    const record = await approvedMedia(d, o.id);
    if (!record) continue;
    const src = pickPublicSrc(record);
    if (!src) continue;
    out.push(toDisplayMedia(entry, record, src));
  }
  // Logos first, then heroes, then gallery: stable, content-driven order
  // (mirrors select.ts so both selectors agree on gallery order).
  const roleRank = (r: string) => (r === "logo" ? 0 : r === "hero" ? 1 : 2);
  out.sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role || "") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return out;
}

/** The automatic hero pick over projected media: hero-role first, then photographic. Logos never. */
function autoHero(all: DisplayMedia[]): DisplayMedia | null {
  const photographic = all.filter((d) => d.role !== "logo");
  return photographic.find((d) => d.role === "hero") ?? photographic[0] ?? null;
}

/**
 * Resolve the hero through the authority gate, honoring the owner's
 * recorded selection when it is valid. The owner id must name an
 * authority-approved, photographic (non-logo), variant-bearing asset
 * attached to the object; anything else falls back to the automatic
 * selection with a diagnostic note.
 *
 * Deterministic: same graph, manifest, authority records, object, and
 * owner id -> same resolution. No mutation.
 */
export async function resolveAuthorityHero(
  graph: ObjectGraph,
  manifest: MediaManifest | null,
  objectId: string,
  ownerHeroId: string | null | undefined,
  deps?: ProjectionDeps,
): Promise<AuthorityHeroResolution> {
  const all = await projectObjectMedia(graph, manifest, objectId, deps);
  const auto = autoHero(all);
  if (!ownerHeroId) {
    return {
      media: auto,
      basis: "auto",
      ownerSelectedId: null,
      note: auto
        ? "Automatic hero selection through the media authority: hero-role asset preferred, else the best photographic approved asset."
        : "Automatic hero selection through the media authority: no approved photographic media; the caller renders the generated treatment.",
    };
  }
  // The owner's pick resolves through the same projection as every
  // other consumer (semantic attachment, authority gate, public URL
  // pick). Not present here means not approved or not attached to this
  // object: never honored.
  const chosen = all.find((m) => m.id === ownerHeroId) ?? null;
  if (chosen && chosen.role !== "logo") {
    return {
      media: chosen,
      basis: "owner",
      ownerSelectedId: ownerHeroId,
      note:
        "Owner-selected hero (" +
        ownerHeroId +
        ") outranks the automatic selection.",
    };
  }
  const reason = !chosen
    ? "it does not name an authority-approved asset attached to this object (stale, mistyped, revoked, or gate-rejected)"
    : "a logo is brand identity, not a photographic hero, and can never be the hero";
  return {
    media: auto,
    basis: "owner-fallback",
    ownerSelectedId: ownerHeroId,
    note:
      "Owner selection (" +
      ownerHeroId +
      ") could not be honored: " +
      reason +
      ". Fell back to the automatic selection.",
  };
}

/**
 * The hero projection for an object: approved media when the authority
 * has some, otherwise a generated treatment from deterministic tokens.
 * Exactly one of `media` / `treatment` is set: a surface can never
 * render a broken image, and a missing photo is never an invented one.
 */
export async function projectHero(
  graph: ObjectGraph,
  manifest: MediaManifest | null,
  objectId: string,
  owner: { ownerHeroId?: string | null; title: string },
  deps?: ProjectionDeps,
): Promise<HeroProjection> {
  const res = await resolveAuthorityHero(
    graph,
    manifest,
    objectId,
    owner.ownerHeroId ?? null,
    deps,
  );
  if (res.media) {
    return {
      media: res.media,
      treatment: null,
      basis: res.basis,
      note: res.note,
    };
  }
  return {
    media: null,
    treatment: generatedTreatmentFor({ objectId, title: owner.title }),
    basis: res.basis,
    note: res.note + " No approved media: generated treatment from deterministic tokens.",
  };
}
