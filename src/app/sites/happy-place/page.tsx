/**
 * FYD Social generated-site demo: Happy Place Carpentry.
 *
 * A procedural clone proof: the page below is compiled from a
 * website-ingestion object graph through generateSiteSpec, then rendered
 * from the declarative spec. No hand-layout for this company exists
 * anywhere in the pipeline.
 *
 * The spec is validated before render. An invalid spec never renders.
 */

import { SiteClient } from "./site-client";
import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";

export const metadata = {
  title: "Happy Place Carpentry | FYD Social Generated Site",
  description:
    "A procedurally generated site for Happy Place Carpentry, compiled by FYD Social from a website-ingestion object graph.",
};

export default function HappyPlaceDemoPage() {
  const spec = generateSiteSpec(HAPPY_PLACE_GRAPH, {
    generatedAt: "2026-09-21T12:00:00.000Z",
    eventSequences: [65, 83],
  });
  const knownSchemas = new Set(HAPPY_PLACE_GRAPH.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  const renderable = isRenderable(findings);

  return (
    <main className="min-h-screen bg-background">
      <SiteClient
        spec={spec}
        graph={HAPPY_PLACE_GRAPH}
        findings={findings}
        renderable={renderable}
      />
    </main>
  );
}
