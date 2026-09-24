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
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { DemoOwnerMode } from "@/fyd/owner-mode/demo-owner-mode";
import { heroMediaFor } from "@/fyd/media/select";
import {
  auditSitesRenderClaims,
  logSitesRenderAudit,
} from "@/fyd/sitespec/sites-render-audit";

const SITE_ID = "coppersmith-plumbing";

function ownerName(graph: { objects: { schema: string; visibility: string; title: string }[] }): string {
  const owner = graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  const name = owner?.title?.trim();
  return name ? name : SITE_ID;
}

export async function generateMetadata() {
  const { graph } = await getPingObjectGraph(SITE_ID);
  const name = ownerName(graph);
  return {
    title: `${name} | FYD Social Generated Site`,
    description: `A procedurally generated site for ${name}, compiled by FYD Social from its PING-backed object graph.`,
  };
}

export default async function CoppersmithDemoPage() {
  // Shared render pipeline: base spec compiled from the PING-backed graph
  // with the approved presentation intent applied over it.
  const { graph, spec, findings, renderable } =
    await compileSiteSpecWithIntent(SITE_ID);
  // Hero media, resolved once per page load at the server render
  // seam. Null when the owner has no acquired media.
  const heroMedia = heroMediaFor(SITE_ID, graph, spec.ownerObjectId);

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
      />
      <DemoOwnerMode siteId={SITE_ID} />
    </main>
  );
}
