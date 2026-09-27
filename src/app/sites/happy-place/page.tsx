/**
 * FYD Social generated-site demo: Happy Place Carpentry.
 *
 * LANE-8: the page resolves the viewer class server-side and projects the
 * compiled artifacts through projectForViewer before the client shell ever
 * sees them. The client shell consumes ONLY the projection. The claim is
 * resolved server-side (verified owner identity, or the deliberate
 * engineer grant: ?fyd_advanced=1 plus the server-side grant); unknown,
 * demo, practice, and unverified shapes fail closed to visitor. Demo owner
 * mode mounts on the engineer projection only:
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 never widens the default visitor page.
 *
 * The spec is validated before render. An invalid spec never renders.
 */

import { SiteClient } from "../_shared/site-client";
import { compilePublicSite } from "../_shared/spec-pipeline";
import { generateSiteMetadata } from "../_shared/site-metadata";
import { DemoOwnerMode } from "@/fyd/owner-mode/demo-owner-mode";
import { isDemoOwnerModeEnabled } from "@/fyd/owner-mode/gate";
import { galleryMediaFor, heroMediaFor } from "@/fyd/media/select";
import {
  auditSitesRenderClaims,
  logSitesRenderAudit,
} from "@/fyd/sitespec/sites-render-audit";
import {
  classifyRenderViewer,
  projectForViewer,
} from "@/fyd/sitespec/render-projection";
import { resolveViewerClaim } from "@/fyd/sitespec/render-viewer-server";

const SITE_ID = "happy-place";

export async function generateMetadata() {
  // Trust seam (2026-09-24): title, description, og/twitter tags, and
  // canonical all derive from the site's own PING-backed projection at
  // render time. Nothing hardcoded per site beyond the site id.
  return generateSiteMetadata(SITE_ID);
}

export default async function HappyPlaceDemoPage({
  searchParams,
}: {
  searchParams?: Promise<{ fyd_advanced?: string | string[] }>;
}) {
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

  // LANE-8: the viewer projection seam. Same state, different authorized
  // projections; the default is the visitor projection.
  const viewerKind = classifyRenderViewer(
    await resolveViewerClaim(await searchParams),
  );
  const view = projectForViewer(
    {
      spec,
      graph,
      findings,
      renderable,
      siteId: SITE_ID,
      heroMedia,
      galleryMedia,
    },
    viewerKind,
  );

  return (
    <main className="min-h-screen bg-background">
      <SiteClient view={view} />
      {viewerKind === "engineer" ? (
        <DemoOwnerMode siteId={SITE_ID} enabled={isDemoOwnerModeEnabled()} />
      ) : null}
    </main>
  );
}
