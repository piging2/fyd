/**
 * Portal preview pipeline (server-only).
 *
 * Three progressive modes:
 * - snapshot:    capture/render the authorized public website, optimized
 *                derivative, object-fit cover with focal position.
 *                Safest default.
 * - interactive: sandboxed live preview, ONLY when the origin is on the
 *                explicit allowlist. Never assume framing is permitted.
 * - native:      FYD native projection from the same object graph/SiteSpec.
 *                The moat. The circle's interior chrome (name, facts,
 *                actions) is already native object projection; the visual
 *                hero graduates from snapshot to native over time.
 *
 * Preview contract: LIVE WHEN SAFE + PERMITTED, HIGH-FIDELITY
 * SNAPSHOT/NATIVE PROJECTION OTHERWISE.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCircleProjection, listObjectIds } from "../object/view";
import { getVerifiedPublicProjectionSync } from "../data/ping-object-source";
import { resolveFocal } from "./focal";
import { isSafeWebHref } from "./types";
import type { PortalProjection, PreviewMode, PreviewRecord } from "./types";
import { resolveObjectPresentationIdentity } from "../presentation/identity";

export type { PortalProjection, PreviewMode, PreviewRecord };
export { isSafeWebHref };

/**
 * Interactive preview allowlist. Empty in v1: no origin has been verified
 * for framing permission yet, so every circle uses snapshot mode and the
 * contract stays honest. Origins are added only after explicit
 * framing-permission verification per origin.
 */
const INTERACTIVE_ALLOWLIST: string[] = [];

export function selectPreviewMode(origin: string | null): PreviewMode {
  if (origin && INTERACTIVE_ALLOWLIST.includes(origin)) return "interactive";
  return "snapshot";
}

interface PreviewManifestFile {
  src: string;
  srcSet: string;
  thumbSrc?: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  basis: string;
  provenance: PreviewRecord["provenance"];
}

function readPreviewManifest(objectId: string): PreviewManifestFile | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "src", "fyd", "preview", "manifests", objectId + ".json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as PreviewManifestFile;
    if (typeof parsed.src !== "string" || !parsed.src) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ManifestMedia {
  id: string;
  roles?: string[];
  digest?: string;
  variants?: Array<{ name: string; url: string; bytes: number; width?: number }>;
}

/** Resolve a display logo at 72 CSS pixels and up to 3x density. */
function resolveLogo(objectId: string): PortalProjection["logo"] {
  const configured = resolveObjectPresentationIdentity({ id: objectId, name: "" }).mark;
  if (configured) return configured;
  try {
    const raw = readFileSync(
      join(process.cwd(), "src", "fyd", "media", "manifests", objectId + ".json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { media?: ManifestMedia[] };
    const media = Array.isArray(parsed.media) ? parsed.media : [];
    const logos = media.filter((m) => (m.roles ?? []).includes("logo"));
    if (logos.length === 0) return null;
    // Deterministic: first logo entry wins. Blur placeholders never become
    // display marks, even when they are the only available variants.
    const logo = logos[0];
    const variants = (logo.variants ?? []).filter((v) =>
      typeof v.url === "string" && v.url.length > 0 && !/^blur(?:$|[-_])/i.test(v.name),
    );
    if (variants.length === 0) return null;
    const knownWidths = variants.filter((v) => typeof v.width === "number" && Number.isFinite(v.width) && v.width > 0);
    const targetWidth = 72 * 3;
    const suitable = knownWidths.filter((v) => v.width! >= targetWidth);
    const candidates = suitable.length > 0 ? suitable : knownWidths.length > 0 ? knownWidths : variants;
    const selected = [...candidates].sort((a, b) => {
      if (knownWidths.length > 0) {
        const widthOrder = suitable.length > 0 ? a.width! - b.width! : b.width! - a.width!;
        if (widthOrder !== 0) return widthOrder;
        if (a.bytes !== b.bytes) return a.bytes - b.bytes;
      } else if (a.bytes !== b.bytes) {
        // Legacy manifests lack dimensions: bytes are only a fallback
        // quality proxy, so prefer the largest non-placeholder asset.
        return b.bytes - a.bytes;
      }
      return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
    })[0];
    return {
      src: selected.url,
      digest: logo.digest ?? "",
      basis: "Ingested site logo, no owner upload",
    };
  } catch {
    return null;
  }
}

function websiteHrefFor(circle: PortalProjection["circle"]): string | null {
  const cap = circle.capabilities.find((c) => c.kind === "website");
  if (!cap || cap.kind !== "website") return null;
  return isSafeWebHref(cap.href) ? cap.href : null;
}

/**
 * Build the portal projection for a known object id. Returns null for
 * unknown ids. Server-only: reads preview + media manifests from disk.
 */
export function buildPortalProjection(objectId: string): PortalProjection | null {
  // Public consumer (Q-C-01): the circle is composed over the verified
  // public projection, never the raw source graph.
  let circle = null;
  try {
    circle = loadCircleProjection(
      getVerifiedPublicProjectionSync(objectId, "anonymous"),
      objectId,
    );
  } catch {
    circle = null;
  }
  if (!circle) return null;
  const manifest = readPreviewManifest(objectId);
  // Re-resolve the focal basis deterministically so the record is
  // self-describing even if the manifest predates the focal system.
  const focal = manifest ? resolveFocal({}) : null;
  return {
    circle,
    logo: resolveLogo(objectId),
    preview: manifest
      ? {
          src: manifest.src,
          srcSet: manifest.srcSet,
          thumbSrc: manifest.thumbSrc ?? manifest.src,
          width: manifest.width,
          height: manifest.height,
          focalX: manifest.focalX,
          focalY: manifest.focalY,
          basis: manifest.basis || (focal ? focal.basis : "unknown"),
          provenance: manifest.provenance,
        }
      : null,
    websiteHref: websiteHrefFor(circle),
  };
}

/**
 * Reviewed homepage placements: Happy Place, Coppersmith, and PING's own
 * FYD object (Nolan, 2026-10-04). Every entry uses the same projection and
 * presentation path. Filesystem test tenants and duplicate acquisition
 * fixtures do not become public placements merely by existing on disk.
 */
export const HOMEPAGE_CIRCLE_SITE_IDS: string[] = ["happy-place", "coppersmith-plumbing", "ping-fyd"];

/** Object ids with portal projections available. Derived from the authoritative
 * object registry, never a hardcoded customer list. */
export function listPortalIds(): string[] {
  return listObjectIds().filter((id) => buildPortalProjection(id) !== null);
}
