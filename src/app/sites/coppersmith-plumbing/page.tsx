/**
 * FYD Social generated-site demo: Coppersmith Plumbing & HVAC.
 *
 * Second procedural-clone proof (grill plan item 2): the page below is
 * compiled from the site's PING-backed object graph (canonical projection
 * written by the PING-side dump, overlays applied from PING events) through
 * generateSiteSpec, then rendered from the declarative spec. No hand-layout
 * for this company exists anywhere in the pipeline, and no customer fact is
 * hardcoded in this file: the graph, the spec compile pins, and the metadata
 * all come from PING.
 *
 * The spec is validated before render. An invalid spec never renders.
 */

import { SiteClient } from "../_shared/site-client";
import {
  compileSiteSpecWithIntent,
  publicGraph,
} from "../_shared/spec-pipeline";
import { generateSiteMetadata } from "../_shared/site-metadata";
import { DemoOwnerMode } from "@/fyd/owner-mode/demo-owner-mode";
import { galleryMediaFor, heroMediaFor } from "@/fyd/media/select";
import {
  auditSitesRenderClaims,
  logSitesRenderAudit,
} from "@/fyd/sitespec/sites-render-audit";

const SITE_ID = "coppersmith-plumbing";

export async function generateMetadata() {
  // Trust seam (2026-09-24): title, description, og/twitter tags, and
  // canonical all derive from the site's own PING-backed projection at
  // render time. Nothing hardcoded per site beyond the site id.
  return generateSiteMetadata(SITE_ID);
}

export default async function CoppersmithDemoPage() {
  // Shared render pipeline: base spec compiled from the PING-backed graph
  // with the approved presentation intent applied over it.
  const { graph, spec, findings, renderable } =
    await compileSiteSpecWithIntent(SITE_ID);
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

  return (
    <main className="min-h-screen bg-background">
      <SiteClient
        spec={spec}
        graph={publicGraph(graph)}
        findings={findings}
        renderable={renderable}
        siteId={SITE_ID}
        heroMedia={heroMedia}
        galleryMedia={galleryMedia}
      />
      <DemoOwnerMode siteId={SITE_ID} />
    </main>
  );
}
