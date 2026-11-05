/**
 * tenant-t8-fontbody.test.ts — pins Website UI audit 2026-11-01
 * finding T8.
 *
 * The finding: every tenant theme declares fontBody (e.g. Geist /
 * sans) but the renderer never applied it, while the global
 * stylesheet set body copy in a Georgia serif stack — tenants
 * rendered body text in a serif they never chose and the token was
 * inert. (The public VisitorExperience already applied
 * var(--fyd-font-body) at its root; the renderer path — builder and
 * owner-editor surfaces — did not.)
 *
 * The fix applies theme.fontBody on the SectionShell <section>,
 * the one element every rendered section passes through, so all
 * section body copy inherits the tenant's declared body font.
 * Headings keep their inline fontDisplay override.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView } from "../renderer";
import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import type {
  FYDPage,
  FYDSection,
  FYDSiteSpec,
  ObjectGraph,
  ViewerContext,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

function obj(partial: Partial<PingObject> & { id: string; schema: string; title: string }): PingObject {
  return {
    controllerId: "test",
    visibility: "public",
    description: "",
    fields: {},
    createdAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: "2026-09-22T00:00:00Z",
    },
    ...partial,
  } as PingObject;
}

const GRAPH: ObjectGraph = {
  objects: [
    obj({ id: "biz-1", schema: "ping.social.business@1", title: "Acme Plumbing" }),
    obj({
      id: "svc-1",
      schema: "ping.social.service@1",
      title: "Drain cleaning",
      description: "Fast drain clearing.",
    }),
  ],
  relationships: [],
};

describe("tenant audit T8: the tenant fontBody governs section body copy", () => {
  test("rendered section carries the theme fontBody", () => {
    const themeTokens = {
      ...DEFAULT_FYD_THEME,
      fontBody: "Tenant Sans, system-ui, sans-serif",
    };
    const section: FYDSection = {
      id: "home:Services:0",
      component: "Services",
      query: { kind: "reference", objectIds: ["svc-1"] },
      presentation: {},
    };
    const page: FYDPage = {
      slug: "home",
      title: "Home",
      navLabel: "Home",
      sections: [section],
    };
    const spec: FYDSiteSpec = {
      kind: "fyd.sitespec@1",
      ownerObjectId: "biz-1",
      version: 1,
      generator: {
        name: "fyd-site-generator",
        version: "test",
        generatedAt: "2026-09-22T00:00:00Z",
      },
      themeTokens,
      navigation: [{ label: "Home", pageSlug: "home" }],
      pages: [page],
      provenance: {
        source: "website-ingestion",
        claimKind: "website_statement",
        note: "t8 test fixture",
      },
    };
    const viewer: ViewerContext = { viewerId: null, displayName: null };
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page,
        ctx: { spec, graph: GRAPH, viewer },
      }),
    );
    expect(html).toContain("Drain cleaning");
    expect(html).toContain("font-family:Tenant Sans, system-ui, sans-serif");
  });
});
