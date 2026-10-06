/**
 * Dogfood render test: PING's own composed site through the real renderer.
 *
 * Composes the ping-fyd spec through the production pipeline (projection
 * load -> object-builder verification -> TECHNOLOGY strategy -> plan ->
 * presentation intent) and renders every page to static markup with the
 * real section components. Guards the dogfood quality bar:
 * - contact discoverability: the owner phone is a one-glance tel: action
 *   in the Hero when the tenant has no website;
 * - service discoverability: all 4 owner-asserted services render with
 *   their evidence-bound descriptions;
 * - Ask FYD: the section is present, correctly named, evidence-framed;
 * - PING brand arrives via theme tokens (gold accent, purple ink), never
 *   hardcoded in components.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { verifyObjectGraph } from "@/fyd/builder/object-builder";
import { planSite } from "@/fyd/builder/planner";
import { strategyForSite } from "@/fyd/builder/strategy-for-site";
import { applyPresentationIntent } from "@/fyd/customize/apply-layer";
import { buildRenderContext, SitePageView } from "../renderer";
import type { FYDSiteSpec } from "@/fyd/sitespec/types";

const SITE_ID = "ping-fyd";

async function composeAndRender() {
  const projection = await getPingObjectGraph(SITE_ID);
  const verified = verifyObjectGraph({ tenantId: SITE_ID }, projection);
  const strategy = strategyForSite(SITE_ID, verified.graph);
  const planned = planSite({
    ctx: { tenantId: SITE_ID },
    graph: verified.graph,
    vector: strategy.vector,
    generatedAt: projection.meta.generatedAt,
    attestation: verified.attestation,
  });
  const spec: FYDSiteSpec = applyPresentationIntent(
    planned.spec,
    projection.presentationIntent,
    verified.graph,
  ).spec;
  const base = buildRenderContext(spec, verified.graph, {
    viewerId: null,
    displayName: null,
  });
  const ctx = { ...base, siteId: SITE_ID };
  const pages = new Map(
    spec.pages.map((p) => [
      p.slug,
      renderToStaticMarkup(SitePageView({ page: p, ctx })),
    ]),
  );
  return { spec, verified, pages };
}

test("ping-fyd home: contact is one glance away (tel: hero action, no website)", async () => {
  const { pages } = await composeAndRender();
  const home = pages.get("home")!;
  expect(home).toContain('href="tel:');
  expect(home).toContain("Call (970) 589-3309");
}, 60000);

test("ping-fyd home: all 4 owner-asserted services render with evidence-bound copy", async () => {
  const { pages, verified } = await composeAndRender();
  const home = pages.get("home")!;
  const services = verified.graph.objects.filter(
    (o) => o.schema === "ping.social.service@1",
  );
  expect(services).toHaveLength(4);
  for (const s of services) {
    expect(home).toContain(s.title);
    if (s.description) expect(home).toContain(s.description);
  }
}, 60000);

test("ping-fyd home: Ask FYD section is present, correctly named, evidence-framed", async () => {
  const { pages } = await composeAndRender();
  const home = pages.get("home")!;
  expect(home).toContain('id="ask"');
  expect(home).toContain("Ask FYD about PING Social");
  expect(home).toContain("Questions go to Ask FYD.");
  expect(home).not.toContain("FYD Social");
}, 60000);

test("ping-fyd: PING brand arrives via theme tokens, never hardcoded components", async () => {
  const { pages, spec } = await composeAndRender();
  expect(spec.themeTokens.accent).toBe("#C9A227");
  expect(spec.themeTokens.ink).toBe("#232033");
  const home = pages.get("home")!;
  expect(home).toContain("#C9A227");
  expect(home).toContain("#232033");
}, 60000);
