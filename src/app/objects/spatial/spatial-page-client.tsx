"use client";

/**
 * Spatial page client: thin wrapper around the SpatialCanvas with the
 * page chrome (title + cross-link back to the rectangle version).
 */

import { SpatialCanvas } from "@/fyd/ui/spatial/spatial-canvas";
import type { SnapshotInfo } from "@/fyd/ui/spatial/center-portal";
import type { SpatialSpec } from "@/fyd/spatial/object-space";
import type { ObjectProjection } from "@/fyd/object/object-projection";

export function SpatialPageClient({
  initialProjection,
  initialSpec,
  snapshot,
}: {
  initialProjection: ObjectProjection;
  initialSpec: SpatialSpec;
  snapshot: SnapshotInfo | null;
}) {
  return (
    <main className="min-h-screen bg-purple-950 text-purple-50">
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-200/80">
          PING object space
        </p>
        <h1 className="mt-1 text-2xl font-bold text-purple-50">
          {initialProjection.name}, in space
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-purple-200">
          One object and its satellites. Hover or tap the center to look
          closer, tap a satellite to move through the graph. Everything
          shown carries its evidence.
        </p>
      </div>
      <SpatialCanvas
        initialProjection={initialProjection}
        initialSpec={initialSpec}
        snapshot={snapshot}
      />
    </main>
  );
}
