/**
 * FYD golden customer route: /build/[siteId].
 *
 * The dynamic composition route. Same pipeline as the /sites/* demos
 * (PING-backed object graph -> object-builder verification -> site
 * planner -> owner presentation intent -> hero media -> validate ->
 * render), but the chrome is the
 * customer own: no PING marketing header/footer (the root layout treats
 * /build/* as chromeless) and no FYD demo framing. The page renders the
 * generic BuildClient composition shell: page content in the center,
 * ObjectRail in the margin, Ask FYD from the spec own sections.
 *
 * Unknown site ids 404. An invalid spec never renders (renderable gate).
 * No customer fact is hardcoded here: names, sections, and objects all
 * come from the projection through the spec.
 */

import { notFound } from "next/navigation";
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { verifyObjectGraph } from "@/fyd/builder/object-builder";
import { planSite } from "@/fyd/builder/planner";
import { vectorForSite } from "@/fyd/builder/site-vectors";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";
import { applyPresentationIntent } from "@/fyd/customize/apply-layer";
import { heroMediaFor } from "@/fyd/media/select";
import { schemaRole } from "@/fyd/sitespec/schemas";
import { BuildClient } from "./build-client";

function ownerName(
  graph: { objects: { schema: string; visibility: string; title: string }[] },
  fallback: string,
): string {
  const owner = graph.objects.find(
    (o) => schemaRole(o.schema) === "business" && o.visibility === "public",
  );
  const name = owner?.title?.trim();
  return name ? name : fallback;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const projection = await getPingObjectGraph(siteId).catch(() => null);
  if (!projection) return { title: "Site not found" };
  const name = ownerName(projection.graph, siteId);
  return {
    title: name,
    description: "A site composed by FYD from the business object graph.",
  };
}

export default async function BuildSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  // Fail closed on unknown sites: getPingObjectGraph throws when the
  // projection is missing, which becomes a 404, never a 500 with fiction.
  const projection = await getPingObjectGraph(siteId).catch(() => null);
  if (!projection) notFound();
  const { graph, meta, presentationIntent } = projection;
  // OBJECT BUILDER boundary: the graph is verified and attested before
  // the website builder plans anything from it. The tenant context is the
  // site id, so a cross-tenant graph cannot reach the planner.
  const verified = verifyObjectGraph({ tenantId: siteId }, projection);
  // WEBSITE BUILDER: deterministic planning from the verified graph with
  // this tenant composition operating point. The planner never
  // manufactures business facts: every section comes from the data-driven
  // generator, and every generated copy slot is evidence-bound and
  // verified before the spec is returned.
  const planned = planSite({
    ctx: { tenantId: siteId },
    graph: verified.graph,
    vector: vectorForSite(siteId),
    generatedAt: meta.generatedAt,
    eventSequences: meta.eventSequences ?? undefined,
    attestation: verified.attestation,
  });
  const base = planned.spec;
  // PRESENTATION INTENT layer: approved owner directives applied OVER the
  // compiled spec. Facts (graph) and design system (theme) are untouched.
  const spec = applyPresentationIntent(base, presentationIntent, graph).spec;
  // Hero media, resolved once per page load at the server render seam.
  // Null when the owner has no acquired media.
  const heroMedia = heroMediaFor(siteId, graph, spec.ownerObjectId);
  const knownSchemas = new Set(graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  const renderable = isRenderable(findings);

  return (
    <main className="min-h-screen bg-background">
      <BuildClient
        spec={spec}
        graph={graph}
        findings={findings}
        renderable={renderable}
        siteId={siteId}
        heroMedia={heroMedia}
      />
    </main>
  );
}
