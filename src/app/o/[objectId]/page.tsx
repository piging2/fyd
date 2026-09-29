// DEMOTED: the full-page customer projection is an optional projection, not the product surface.
// The product primitive is the Circle. This page remains for the optional-projection lane and is
// not linked from normal navigation. The owner control plane (./manage) is unaffected.
/**
 * Object Node: the complete intelligent presence of one FYD object.
 *
 * This page belongs visually to the OBJECT (Happy Place Carpentry,
 * Coppersmith Plumbing), not to PING. No PING navigation, no PING footer,
 * no engineering language. Provenance stays underneath as a quiet
 * secondary disclosure.
 *
 * Everything on this page renders from the generic ObjectView projection.
 * There is no business-specific code here: HPP and Coppersmith flow
 * through exactly the same components. The rendered surface lives in
 * ./object-node-view (pure component, unit of the PROD-10 de-harness
 * tests); this module only loads data and delegates.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadObjectViewBySlugOrId } from "@/fyd/object/by-id";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import { ObjectNodeView } from "./object-node-view";

export const dynamic = "force-dynamic";

/**
 * Memoized public-projection resolver for the cross-tenant scan (Q-C-01):
 * every view on this page is composed from a verified public projection.
 */
function resolvePublicProjection(
  cache: Map<string, VerifiedPublicProjection | null>,
  siteId: string,
): VerifiedPublicProjection | null {
  if (!cache.has(siteId)) {
    try {
      cache.set(
        siteId,
        getVerifiedPublicProjectionSync(siteId, "anonymous"),
      );
    } catch {
      cache.set(siteId, null);
    }
  }
  return cache.get(siteId) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ objectId: string }>;
}): Promise<Metadata> {
  const { objectId } = await params;
  const cache = new Map<string, VerifiedPublicProjection | null>();
  const resolved = loadObjectViewBySlugOrId(objectId, (siteId) =>
    resolvePublicProjection(cache, siteId),
  );
  const view = resolved?.view ?? null;
  const tenantId = resolved?.siteId ?? null;
  if (!view) return { title: { absolute: "Object not found | FYD" }, robots: { index: false } };
  return {
    title: { absolute: view.name },
    description: view.summary.slice(0, 160),
    keywords: [view.category, ...view.services.map((s) => s.name)].filter(
      (k): k is string => k !== null,
    ),
    alternates: { canonical: `/o/${view.id}` },
    robots: { index: false },
    openGraph: {
      title: view.name,
      description: view.summary.slice(0, 160),
      url: `/o/${view.id}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: view.name,
      description: view.summary.slice(0, 160),
    },
  };
}

export default async function ObjectNodePage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;
  const cache = new Map<string, VerifiedPublicProjection | null>();
  const resolved = loadObjectViewBySlugOrId(objectId, (siteId) =>
    resolvePublicProjection(cache, siteId),
  );
  const view = resolved?.view ?? null;
  const tenantId = resolved?.siteId ?? null;
  if (!view) notFound();

  return <ObjectNodeView view={view} tenantId={tenantId} />;
}
