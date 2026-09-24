/**
 * /objects/spatial: the spatial object experience for Happy Place.
 *
 * Server page following the proven /objects read seam: loadObjectView +
 * getPingObjectGraphSync + objectViewToProjection, then derive the initial
 * SpatialSpec server-side. The center's website snapshot is loaded
 * server-side from the capture manifest; when the capture has not landed
 * (manifest or derivative files absent) the snapshot is null and the
 * client fails closed with text. No invented fallback visual, ever.
 * The rectangle version at /objects is untouched.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { loadObjectView } from "@/fyd/object/view";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { deriveSpatialSpec } from "@/fyd/spatial/object-space";
import type { SnapshotInfo } from "@/fyd/ui/spatial/center-portal";
import { SpatialPageClient } from "./spatial-page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Happy Place, in space | PING",
  description:
    "Happy Place Carpentry as a spatial object: one center, its satellites, nothing invented.",
  robots: { index: false },
};

interface ManifestProvenance {
  url?: string;
  capturedAt?: string;
  captureMethod?: string;
  captureNote?: string;
  digest?: string;
}

interface SnapshotManifest {
  src?: string;
  srcSet?: string;
  width?: number;
  height?: number;
  focalX?: number;
  focalY?: number;
  provenance?: ManifestProvenance;
}

/**
 * Load the website snapshot manifest server-side. Returns null when the
 * capture has not landed: the manifest file is absent, malformed, or its
 * derivative files are not on disk. Callers fail closed on null.
 */
function loadSnapshot(): SnapshotInfo | null {
  try {
    const manifestPath = join(
      process.cwd(),
      "src/fyd/preview/manifests/happy-place.json",
    );
    const raw = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as SnapshotManifest;
    const digest = raw.provenance?.digest;
    if (!raw.src || !digest) return null;
    const digestDir = join(process.cwd(), "public/fyd-media", digest);
    if (!existsSync(digestDir)) return null;
    return {
      src: raw.src,
      srcSet: raw.srcSet ?? "",
      width: raw.width ?? 0,
      height: raw.height ?? 0,
      focalX: raw.focalX ?? 0.5,
      focalY: raw.focalY ?? 0.3,
      provenance: {
        url: raw.provenance?.url ?? "",
        capturedAt: raw.provenance?.capturedAt ?? "",
        captureMethod: raw.provenance?.captureMethod ?? "",
        captureNote: raw.provenance?.captureNote ?? undefined,
      },
    };
  } catch {
    return null;
  }
}

export default function SpatialObjectsPage() {
  let view;
  try {
    view = loadObjectView("happy-place");
  } catch {
    view = null;
  }
  if (!view) notFound();

  let graph;
  try {
    graph = getPingObjectGraphSync("happy-place").graph;
  } catch {
    notFound();
  }

  const projection = objectViewToProjection(view, graph);
  const spec = deriveSpatialSpec({ focus: projection });
  if (!spec) notFound();

  const snapshot = loadSnapshot();

  return (
    <SpatialPageClient
      initialProjection={projection}
      initialSpec={spec}
      snapshot={snapshot}
    />
  );
}
