/**
 * /objects: the PING object experience surface.
 *
 * A quiet PING-chrome page (renders with SiteHeader/SiteFooter) hosting two
 * live identity objects, Happy Place and Coppersmith, built server-side
 * from the digest-verified PING projections through the proven read seam.
 * Nothing here is invented: every fact the expansions show carries its
 * evidence basis from the projection.
 */

import { loadObjectView } from "@/fyd/object/view";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { resolveCircleBackground } from "@/fyd/media/circle-background";
import { ObjectsClient } from "./objects-client";
import type { CircleFace, ObjectHandle } from "@/fyd/ui/identity-object";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Objects | PING",
  description:
    "Two live business identity objects from the PING graph. Hover or tap a circle to expand it.",
  robots: { index: false },
};

const SITE_IDS = ["happy-place", "coppersmith-plumbing"];

function faceFor(
  siteId: string,
  view: { media: { role: string; src: string; alt: string }[] },
  name: string,
): CircleFace {
  // Rights-authorized logo through the existing media seam, else the
  // deterministic gradient fallback. External hotlinks never qualify.
  const logo = view.media.find((m) => m.role === "logo");
  if (logo) return { kind: "logo", src: logo.src, alt: logo.alt || name };
  const bg = resolveCircleBackground(siteId);
  if (bg.kind === "image") {
    return { kind: "logo", src: bg.src, alt: name };
  }
  return { kind: "gradient", css: bg.css };
}

export default function ObjectsPage() {
  const objects: ObjectHandle[] = [];
  for (const siteId of SITE_IDS) {
    let view;
    try {
      view = loadObjectView(siteId);
    } catch {
      continue;
    }
    if (!view) continue;
    let graph;
    try {
      graph = getPingObjectGraphSync(siteId).graph;
    } catch {
      continue;
    }
    const projection = objectViewToProjection(view, graph);
    objects.push({
      siteId,
      projection,
      face: faceFor(siteId, view, projection.name),
      nodeHref: "/o/" + encodeURIComponent(projection.id),
    });
  }

  return <ObjectsClient objects={objects} />;
}
