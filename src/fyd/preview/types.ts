/**
 * Portal preview types (client-safe: no node imports).
 */
import type { CircleProjection } from "../object/types";

export type PreviewMode = "snapshot" | "interactive" | "native";

export interface PreviewProvenance {
  source: string;
  capturedAt: string;
  captureMethod: string;
  digest: string;
  url: string;
}

export interface PreviewRecord {
  /** Engaged-state image: smallest variant >= 800w, else largest. */
  src: string;
  srcSet: string;
  /** Tiny variant for the collapsed state. */
  thumbSrc: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  /** Human-readable focal basis, stored with the record. */
  basis: string;
  provenance: PreviewProvenance;
}

export interface PortalLogo {
  src: string;
  digest: string;
  basis: string;
  /**
   * True when the logo is an owner-supplied asset (not ingested site
   * media). Owner assets render as irregular cutouts: no badge
   * background disc, and they win over the preview photo in the
   * collapsed mark. Nolan 2026-10-02: HPP = tape measure.
   */
  ownerSupplied?: boolean;
}

export interface PortalProjection {
  circle: CircleProjection;
  logo: PortalLogo | null;
  preview: PreviewRecord | null;
  /** Validated https website URL, or null when no safe website exists. */
  websiteHref: string | null;
}

/** Client-safe href check: https only, no javascript:/data:/blob:/file:. */
export function isSafeWebHref(href: string): boolean {
  return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(href);
}
