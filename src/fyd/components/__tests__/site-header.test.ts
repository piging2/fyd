/**
 * Site header tests (polish lane, 2026-09-26).
 *
 * The visitor header carries the BUSINESS wordmark (owner display name;
 * logo media when the projection carries one), never the platform kicker.
 * "FYD Social" lives only in the quiet provenance footer. The margin
 * object layer (owner/engineer surface) never mounts for visitors.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs site-header
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { SiteClient } from "../../../app/sites/_shared/site-client";
import { planSite } from "../../builder/planner";
import { COPPERSMITH_VECTOR } from "../../builder/dimensions";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import type { ProjectedSiteView } from "../../sitespec/render-projection";
import type { ObjectGraph, ViewerContext } from "../../sitespec/types";

const VIEWER: ViewerContext = { viewerId: null, displayName: null };
const GRAPH = HAPPY_PLACE_GRAPH as unknown as ObjectGraph;
void VIEWER;

function viewWith(overrides: Partial<ProjectedSiteView>): ProjectedSiteView {
  const spec = planSite({
    ctx: { tenantId: "site-header-test" },
    graph: GRAPH,
    vector: COPPERSMITH_VECTOR,
    generatedAt: "2026-09-24T00:00:00Z",
  }).spec;
  return {
    __projectedSiteView: "ProjectedSiteView",
    viewerKind: "visitor",
    spec,
    graph: GRAPH,
    findings: [],
    renderable: true,
    siteId: "happy-place",
    heroMedia: null,
    galleryMedia: null,
    ownerLogo: null,
    source: {
      sourceLabel: "The business website",
      observedLabel: "September 2026",
      honestyNote: "The business's own words. Not independently verified.",
    },
    showOwnerEntry: false,
    ownerConsole: null,
    ...overrides,
  };
}

/** The <header> block's static markup. */
function headerMarkup(body: string): string {
  const open = body.indexOf("<header");
  expect(open).toBeGreaterThan(-1);
  const close = body.indexOf("</header>", open);
  expect(close).toBeGreaterThan(open);
  return body.slice(open, close);
}

describe("visitor site header", () => {
  test("header shows the owner business name as the wordmark, not the platform kicker", () => {
    const body = renderToStaticMarkup(React.createElement(SiteClient, { view: viewWith({}) }));
    const header = headerMarkup(body);
    expect(header).toContain("Happy Place Carpentry");
    expect(header).not.toContain("FYD Social");
  });

  test("owner logo renders presentation-only when the projection carries one", () => {
    const logo = {
      src: "/media/logo.png",
      width: 200,
      height: 100,
    };
    const body = renderToStaticMarkup(
      React.createElement(SiteClient, { view: viewWith({ ownerLogo: logo as never }) }),
    );
    const header = headerMarkup(body);
    expect(header).toContain('src="/media/logo.png"');
    // Presentation-only: empty alt, never a brand claim.
    expect(header).toContain('alt=""');
    expect(header).toContain("Happy Place Carpentry");
  });

  test("no logo: text wordmark alone, no broken image", () => {
    const body = renderToStaticMarkup(React.createElement(SiteClient, { view: viewWith({}) }));
    const header = headerMarkup(body);
    expect(header).not.toContain("<img");
    expect(header).toContain("Happy Place Carpentry");
  });

  test("visitor mounts no margin object layer", () => {
    const body = renderToStaticMarkup(React.createElement(SiteClient, { view: viewWith({}) }));
    expect(body).not.toContain('data-testid="object-layer"');
  });

  test("owner mounts the margin object layer", () => {
    const body = renderToStaticMarkup(
      React.createElement(SiteClient, { view: viewWith({ viewerKind: "owner" }) }),
    );
    expect(body).toContain('data-testid="object-layer"');
  });
});
