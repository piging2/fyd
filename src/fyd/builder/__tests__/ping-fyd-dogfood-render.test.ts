/**
 * Dogfood render verification: PING's own site through the FYD substrate.
 *
 * Node-level mirror of the golden customer route
 * (src/app/build/[siteId]/page.tsx). The live route is currently 404'd at
 * the router by the Circle-Only Product Reset middleware (experimental
 * product routes disabled), so this test runs the identical pipeline —
 * projection load -> object-builder verification -> strategy resolution ->
 * plan -> presentation intent -> hero media -> validate -> renderable gate —
 * at node level and asserts the dogfood site composes renderable.
 *
 * PING-specific facts come only from the owner-asserted projection
 * (/home/nolan/ping/var/fyd-projections/ping-fyd.json); nothing about
 * PING Social is hardcoded here.
 */
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { verifyObjectGraph } from "@/fyd/builder/object-builder";
import { planSite, resolveQueryObjects } from "@/fyd/builder/planner";
import { strategyForSite } from "@/fyd/builder/strategy-for-site";
import { applyPresentationIntent } from "@/fyd/customize/apply-layer";
import { heroMediaFor } from "@/fyd/media/select";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";
import type { FYDSiteSpec } from "@/fyd/sitespec/types";
import type { ObjectGraph } from "@/fyd/sitespec/types";

const SITE_ID = "ping-fyd";

async function composePingFyd() {
  const projection = await getPingObjectGraph(SITE_ID);
  const verified = verifyObjectGraph({ tenantId: SITE_ID }, projection);
  const strategy = strategyForSite(SITE_ID, verified.graph);
  const planned = planSite({
    ctx: { tenantId: SITE_ID },
    graph: verified.graph,
    vector: strategy.vector,
    generatedAt: projection.meta.generatedAt,
    eventSequences: projection.meta.eventSequences ?? undefined,
    attestation: verified.attestation,
  });
  const spec: FYDSiteSpec = applyPresentationIntent(
    planned.spec,
    projection.presentationIntent,
    verified.graph,
  ).spec;
  const heroMedia = await heroMediaFor(SITE_ID, verified.graph, spec.ownerObjectId);
  const knownSchemas = new Set(verified.graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  return { projection, verified, strategy, spec, heroMedia, findings };
}

function sectionComponents(spec: FYDSiteSpec): string[] {
  return spec.pages.flatMap((p) => p.sections.map((s) => s.component));
}

test("ping-fyd: projection loads, verifies, and resolves the TECHNOLOGY strategy", async () => {
  const { projection, verified, strategy } = await composePingFyd();
  expect(projection.meta.siteId).toBe(SITE_ID);
  // 1 business + 4 services + 1 location + 1 external identity.
  expect(projection.graph.objects).toHaveLength(7);
  expect(verified.attestation).toBeTruthy();
  // Explicit tenant pin wins over graph inference.
  expect(strategy.name).toBe("TECHNOLOGY");
}, 60000);

test("ping-fyd: spec validates and passes the renderable gate", async () => {
  const { spec, findings, heroMedia } = await composePingFyd();
  const blocking = findings.filter((f) => f.severity === "error");
  expect(blocking).toEqual([]);
  expect(isRenderable(findings)).toBe(true);
  // No PING media acquired yet: hero stays null, never a hotlink, never a
  // fabricated asset.
  expect(heroMedia).toBeNull();
  // Ask FYD, contact, and service discovery are must-win components.
  const components = sectionComponents(spec);
  for (const must of ["Hero", "AskFYD", "Contact", "Services", "ObjectRail"]) {
    expect(components).toContain(must);
  }
}, 60000);

test("ping-fyd: the 4 owner-asserted services are bound to the Services section", async () => {
  const { spec, verified } = await composePingFyd();
  const services = spec.pages
    .flatMap((p) => p.sections)
    .find((s) => s.component === "Services");
  expect(services).toBeDefined();
  const graph: ObjectGraph = verified.graph;
  const bound = resolveQueryObjects(graph, services!.query).map((o) => o.id).sort();
  expect(bound).toEqual([
    "ping-fyd-svc-admin",
    "ping-fyd-svc-calls",
    "ping-fyd-svc-followup",
    "ping-fyd-svc-scheduling",
  ]);
}, 60000);

test("ping-fyd: owner phone from the projection is the contact fact (no invented contact)", async () => {
  const { spec, verified } = await composePingFyd();
  const business = verified.graph.objects.find((o) => o.id === spec.ownerObjectId);
  expect(business?.fields?.phone).toBe("(970) 589-3309");
}, 60000);
