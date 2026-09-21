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
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";

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
  const { graph, meta } = await getPingObjectGraph(SITE_ID);
  const spec = generateSiteSpec(graph, {
    generatedAt: meta.generatedAt,
    eventSequences: meta.eventSequences ?? undefined,
  });
  const knownSchemas = new Set(graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  const renderable = isRenderable(findings);

  return (
    <main className="min-h-screen bg-background">
      <SiteClient
        spec={spec}
        graph={graph}
        findings={findings}
        renderable={renderable}
        siteId={SITE_ID}
      />
    </main>
  );
}
