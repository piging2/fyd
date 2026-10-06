/**
 * FYD Social generated-site: dynamic site route.
 *
 * Live observability: this single route serves ALL sites discovered from
 * the projection directory. No per-business directories, no hardcoded
 * site IDs. Adding a projection JSON automatically adds the site.
 *
 * The page is compiled from the site's PING-backed object graph through
 * generateSiteSpec, then rendered from the declarative spec. No hand-layout
 * for any company exists anywhere in the pipeline, and no customer fact is
 * hardcoded: the graph, the spec compile pins, and the metadata all come
 * from PING at render time.
 *
 * The spec is validated before render. An invalid spec never renders.
 */

import { SiteClient } from "../_shared/site-client";
import { compilePublicSite } from "../_shared/spec-pipeline";
import {
  generateSiteMetadata,
  resolveSiteDisplayName,
} from "../_shared/site-metadata";
import { galleryMediaFor, heroMediaFor } from "@/fyd/media/select";
import {
  auditSitesRenderClaims,
  logSitesRenderAudit,
} from "@/fyd/sitespec/sites-render-audit";
import { listPingSiteIdsSync } from "@/fyd/data/ping-object-source";

/**
 * Pre-render all known sites at build time. New projections added after
 * the build are served dynamically (no rebuild required for the route
 * to exist, though ISR may be needed for full static optimization).
 */
export async function generateStaticParams() {
  return listPingSiteIdsSync().map((siteId) => ({ siteId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  // Trust seam (2026-09-24): title, description, og/twitter tags, and
  // canonical all derive from the site's own PING-backed projection at
  // render time. Nothing hardcoded per site.
  return generateSiteMetadata(siteId);
}

export default async function DynamicSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId: SITE_ID } = await params;

  // Shared render pipeline: base spec compiled from the PING-backed graph
  // with the approved presentation intent applied over it.
  // Verified public projection (Q-C-01): the graph below already passed
  // the single public projection boundary; no separate publicGraph step.
  const { graph, spec, findings, renderable } =
    await compilePublicSite(SITE_ID);
  // Hero media, resolved once per page load at the server render
  // seam. Null when the owner has no acquired media.
  const heroMedia = heroMediaFor(SITE_ID, graph, spec.ownerObjectId);
  // Gallery media, resolved once per page load at the server render
  // seam. Null when the owner has no gallery assets: the Gallery
  // section renders nothing, never an empty frame.
  const galleryAssets = galleryMediaFor(SITE_ID, graph, spec.ownerObjectId);
  const galleryMedia = galleryAssets.length > 0 ? galleryAssets : null;

  // Binding-verification observation tap (WIRE-SPEC; QA-TRUTH R-A,
  // LANE-CLAIM R-MODEL): run this render's claims through the strong
  // BindingVerifier and log the verdicts. Observation only: never throws,
  // never mutates the spec, the findings, or the rendered output. The
  // frozen golden route renders byte-identically with or without it.
  try {
    logSitesRenderAudit(auditSitesRenderClaims(spec, graph, SITE_ID));
  } catch {
    // The audit must never break the render path.
  }

  // PROD-1 (2026-09-27): PUBLIC ROUTE. Owner chrome is never mounted
  // here, even with NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1: no DemoOwnerMode
  // panel (it lives only on explicit owner routes such as /dev/objects),
  // no customize console (ownerConsole defaults off), and the header's
  // first <h1> is the binding-verified business name.
  return (
    <main className="min-h-screen bg-background">
      <SiteClient
        spec={spec}
        graph={graph}
        findings={findings}
        renderable={renderable}
        siteId={SITE_ID}
        heroMedia={heroMedia}
        galleryMedia={galleryMedia}
        siteName={resolveSiteDisplayName(graph)}
      />
    </main>
  );
}
