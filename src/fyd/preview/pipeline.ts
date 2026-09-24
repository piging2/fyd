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
import { resolveFocal } from "./focal";
import { isSafeWebHref } from "./types";
import type { PortalProjection, PreviewMode, PreviewRecord } from "./types";

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

/** Resolve the ingested logo (role "logo"), smallest variant. Null when none. */
function resolveLogo(objectId: string): PortalProjection["logo"] {
  try {
    const raw = readFileSync(
      join(process.cwd(), "src", "fyd", "media", "manifests", objectId + ".json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { media?: ManifestMedia[] };
    const media = Array.isArray(parsed.media) ? parsed.media : [];
    const logos = media.filter((m) => (m.roles ?? []).includes("logo"));
    if (logos.length === 0) return null;
    // Deterministic: first logo entry wins; smallest variant by bytes.
    const logo = logos[0];
    const variants = (logo.variants ?? []).filter((v) => typeof v.url === "string");
    if (variants.length === 0) return null;
    const smallest = variants.reduce((a, b) => (a.bytes <= b.bytes ? a : b));
    return {
      src: smallest.url,
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
  const circle = loadCircleProjection(objectId);
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
 * Staged rollout gate for homepage Circles (Nolan, 2026-09-22): HAPPY PLACE
 * ONLY until Nolan personally approves the next identity. This is product
 * configuration, not customer branching: every listed site id flows through
 * the identical buildPortalProjection -> CircleProjection -> PortalCircle
 * path with no per-customer behavior. Approving Circle #2 (Coppersmith)
 * Circle #2 (Coppersmith) approved by Nolan 2026-09-22: "Margins Are the
 * Object Layer" object proof.
 */
export const HOMEPAGE_CIRCLE_SITE_IDS: string[] = ["happy-place", "coppersmith-plumbing"];

/** Object ids with portal projections available. Derived from the authoritative
 * object registry, never a hardcoded customer list. */
export function listPortalIds(): string[] {
  return listObjectIds().filter((id) => buildPortalProjection(id) !== null);
}
