export const dynamic = "force-dynamic";

/**
 * FYD objects economic loop: the controlled loop-demo publisher
 * surface (lane B4; DESIGN.md actors and component D).
 *
 * This is a controlled demo surface PING operates end to end. The
 * publisher tenant of record is loop-demo (policy.ts
 * LOOP_PUBLISHER_TENANT_ID); it is NOT a real business, NOT
 * Coppersmith (receive-only, untouched), and carries no customer
 * facts. Its composition object set is the verified public
 * projection of the PING demo object graph (the ping-fyd graph we
 * control), whose owner object is the object the one house campaign
 * promotes.
 *
 * Render law: the composition goes through the loop render seam
 * (src/fyd/ads/render.ts). With the loop flag OFF (the default) the
 * provider is never invoked and this page renders the organic cards
 * exactly as an unwired page would. With the flag ON, an eligible
 * placement (active consent, active campaign, budget in scope)
 * renders through the standard ObjectCard with the Sponsored
 * disclosure chip, and only that card mounts the event collector.
 *
 * The viewer scope is the opaque rotating anonymous scope the
 * placement contract requires: the fyd-ads-scope cookie when the
 * visitor already carries one, otherwise a per-render minted scope.
 * It is never a browsing identity.
 */

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import { loadObjectViewById } from "@/fyd/object/by-id";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { rankCandidates } from "@/fyd/rank/object-ranker";
import { composeLoopSurfaceComposition } from "@/fyd/ads/render";
import {
  LoopComposition,
  type LoopCompositionEntry,
} from "@/fyd/ads/loop-composition";
import { LOOP_PUBLISHER_TENANT_ID, LOOP_SURFACE } from "@/fyd/ads/policy";

/** The demo object set this surface composes from. */
const OBJECT_SOURCE_SITE_ID = "ping-fyd";
/** Composition capacity for the surface (matches its declared slot). */
const COMPOSITION_LIMIT = 12;
const VIEWER_SCOPE_COOKIE = "fyd-ads-scope";

export default async function LoopDemoSurfacePage() {
  const projection = getVerifiedPublicProjectionSync(
    OBJECT_SOURCE_SITE_ID,
    "anonymous",
  );
  const graph = projection.graph;

  // The surface's object set: every public object in the demo graph,
  // each composed through the canonical per-object view loader.
  const views = graph.objects
    .filter((object) => object.visibility === "public")
    .map((object) =>
      loadObjectViewById(projection, OBJECT_SOURCE_SITE_ID, object.id),
    )
    .filter((view) => view !== null);

  // Ranked candidates for the composition. The surface itself is
  // the page context, so every object is a present semantic target;
  // proximity decays gently by graph order so the owner business
  // leads, mirroring how the portal host ranks for a region.
  const candidates = rankCandidates(
    views.map((view, index) => ({
      objectId: view.id,
      semanticProximity: Math.max(0.1, 0.9 - index * 0.05),
      semanticTargetPresent: true,
      followed: false,
      liked: false,
      capabilityCount: view.capabilities.length,
      recentInteractionAt: null,
      slotStability: 1,
      slotCollisionRisk: 0,
    })),
  );

  const cookieStore = await cookies();
  const viewerScopeRef =
    cookieStore.get(VIEWER_SCOPE_COOKIE)?.value ?? randomUUID();

  const composition = composeLoopSurfaceComposition({
    publisherTenantId: LOOP_PUBLISHER_TENANT_ID,
    surface: LOOP_SURFACE,
    viewerScopeRef,
    candidates,
    limit: COMPOSITION_LIMIT,
  });

  const projectionById = new Map(
    views.map((view) => [view.id, objectViewToProjection(view, graph)]),
  );
  const entries: LoopCompositionEntry[] = [];
  for (const item of composition.items) {
    const objectProjection = projectionById.get(item.objectId);
    if (objectProjection) entries.push({ item, projection: objectProjection });
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">FYD loop demo surface</h1>
        <p className="mt-2 text-sm text-stone-500">
          A controlled demonstration surface operated by PING for the
          FYD objects economic loop. It is not a customer site.
        </p>
        <div className="mt-8 flex flex-col gap-4">
          <LoopComposition entries={entries} />
        </div>
      </div>
    </main>
  );
}
