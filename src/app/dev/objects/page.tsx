/**
 * Lane C: INTERNAL /dev/objects lab route.
 * Lane D: deep-link presets (type/projection/viewport) so Card and Node can
 * be verified by plain HTTP GET, e.g.
 *   /dev/objects?site=coppersmith-plumbing&type=Person&projection=Card
 *
 * Internal development infrastructure, NEVER customer product:
 * - robots: noindex, nofollow
 * - not linked from any public page or navigation
 * - absent from the sitemap (sitemap.ts is a static list)
 * - no marketing language anywhere on the page
 *
 * Data: the PING-backed projection read model (getPingObjectGraph), the same
 * fail-closed source the demo sites and Ask FYD read. A missing or tampered
 * projection is a hard failure, rendered as a failure panel with the evidence,
 * never a silent stale render.
 */

import type { Metadata } from "next";
import {
  getPingObjectGraph,
  listPingSiteIds,
} from "@/fyd/data/ping-object-source";
import { buildLabData, type LabTypeName } from "./lab-adapter";
import {
  ObjectsLabClient,
  type LabMeta,
  type ProjectionKind,
  type ViewportPreset,
} from "./objects-lab-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Objects Lab | FYD (internal)" },
  description:
    "Internal developer lab for FYD object projections. Not a customer surface.",
  robots: { index: false, follow: false },
};

const TYPE_VALUES = [
  "Business",
  "Service",
  "Person",
  "Location",
  "Post",
  "Project",
  "Other",
] as const;
const PROJECTION_VALUES = ["Circle", "Card", "Node"] as const;
const VIEWPORT_VALUES = ["mobile", "tablet", "desktop", "wide"] as const;

function LabFailure({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      data-testid="lab-failure"
      className="min-h-screen bg-stone-50 p-8 text-stone-900"
    >
      <div className="mx-auto max-w-2xl rounded-lg border-2 border-red-700 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-red-800">
          Internal dev lab
        </p>
        <h1 className="mt-1 text-xl font-extrabold">{title}</h1>
        <pre className="mt-3 overflow-x-auto rounded bg-stone-100 p-3 font-mono text-xs text-stone-700">
          {detail}
        </pre>
        <p className="mt-3 text-sm text-stone-600">
          The read model is fail-closed: a missing, malformed, or tampered
          projection is refused rather than served stale. Fix the projection
          (PING-side dump) and reload.
        </p>
      </div>
    </div>
  );
}

export default async function ObjectsLabPage({
  searchParams,
}: {
  searchParams: Promise<{
    site?: string;
    type?: string;
    projection?: string;
    viewport?: string;
  }>;
}) {
  const { site, type: rawType, projection: rawProjection, viewport: rawViewport } =
    await searchParams;
  const siteIds = await listPingSiteIds();
  if (siteIds.length === 0) {
    return (
      <LabFailure
        title="No PING projections found"
        detail="listPingSiteIds() returned no site ids. Run the PING-side projection dump first."
      />
    );
  }
  const siteId = site && siteIds.includes(site) ? site : siteIds[0];

  const initialType: LabTypeName | undefined =
    typeof rawType === "string" &&
    (TYPE_VALUES as readonly string[]).includes(rawType)
      ? (rawType as LabTypeName)
      : undefined;
  const initialProjection: ProjectionKind | undefined =
    typeof rawProjection === "string" &&
    (PROJECTION_VALUES as readonly string[]).includes(rawProjection)
      ? (rawProjection as ProjectionKind)
      : undefined;
  const initialViewport: ViewportPreset | undefined =
    typeof rawViewport === "string" &&
    (VIEWPORT_VALUES as readonly string[]).includes(rawViewport)
      ? (rawViewport as ViewportPreset)
      : undefined;

  let projection;
  try {
    projection = await getPingObjectGraph(siteId);
  } catch (err) {
    return (
      <LabFailure
        title={`Projection load failed for "${siteId}"`}
        detail={err instanceof Error ? err.message : String(err)}
      />
    );
  }

  const { graph, meta } = projection;
  const { typeGroups, views } = buildLabData(siteId, graph);
  const labMeta: LabMeta = {
    dumpedAt: meta.dumpedAt,
    dumperVersion: meta.dumperVersion,
    graphDigest: meta.graphDigest,
    generatedAt: meta.generatedAt,
    objectCount: graph.objects.length,
    relationshipCount: graph.relationships.length,
  };

  return (
    <ObjectsLabClient
      siteIds={siteIds}
      siteId={siteId}
      meta={labMeta}
      typeGroups={typeGroups}
      views={views}
      initialType={initialType}
      initialProjection={initialProjection}
      initialViewport={initialViewport}
    />
  );
}
