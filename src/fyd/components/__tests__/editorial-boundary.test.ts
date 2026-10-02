/** Editorial sections must use the existing projection, scope, and binding gates. */
import { renderToStaticMarkup } from "react-dom/server";
import type { PingObject } from "@/lib/ping/types";
import type { FieldVisibilityDecision } from "../../sitespec/field-visibility";
import {
  DEFAULT_FYD_THEME,
  type EditorialIntent,
  type FYDQuery,
  type FYDSection,
  type FYDSiteSpec,
  type ObjectGraph,
} from "../../sitespec/types";
import { editorialHref } from "../editorial-model";
import { buildRenderContext, SitePageView } from "../renderer";

const NOW = "2026-09-29T12:00:00.000Z";
const ORIGIN = "https://cedar.example";
const VIEWER = { viewerId: null, displayName: null };

function object(id: string, title: string, extra: Partial<PingObject> = {}): PingObject {
  return {
    id,
    schema: "example.product@1",
    controllerId: "identity_cedar",
    visibility: "public",
    title,
    description: `${title} published description`,
    fields: { url: `/${id}`, status: "available", date: "2026-09-28" },
    createdAt: NOW,
    updatedAt: NOW,
    provenance: {
      kind: "website-derived",
      ref: `website-ingestion:${ORIGIN}/${id}`,
      derivedAt: NOW,
    },
    ...extra,
  };
}

function graph(): ObjectGraph {
  return {
    objects: [
      object("business", "Cedar Ceramics", { schema: "example.business@1" }),
      object("public-record", "Stoneware Workshop"),
      object("private-record", "Unreleased Glaze Formula", { visibility: "private" }),
      object("hidden-record", "Retired Kiln Collection"),
    ],
    relationships: ["public-record", "private-record", "hidden-record"].map((id) => ({
      id: `business-${id}`,
      subject: "business",
      predicate: "offers",
      object: id,
      status: "active",
      createdAt: NOW,
      evidenceRef: `website-ingestion:${ORIGIN}/catalogue`,
    })),
  };
}

function section(component: string, query: FYDQuery = { kind: "all" }, editorial: EditorialIntent = {}): FYDSection {
  return {
    id: `home:${component}`,
    component,
    query,
    presentation: {
      heading: `Explore ${component.replace("Editorial", "")}`,
      copy: "Explore the published collection.",
      editorial: { sourceOrigin: ORIGIN, ...editorial },
    },
  };
}

function spec(sections: FYDSection[]): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    version: 1,
    ownerObjectId: "business",
    generator: { name: "fyd-site-generator", version: "1", generatedAt: NOW },
    themeTokens: { ...DEFAULT_FYD_THEME },
    navigation: [{ label: "Home", pageSlug: "home" }],
    pages: [{ slug: "home", title: "Home", navLabel: "Home", sections }],
    provenance: { source: "website-ingestion", claimKind: "website_statement", note: "Synthetic public source" },
  };
}

function render(source: ObjectGraph, site: FYDSiteSpec, decisions: FieldVisibilityDecision[] = []) {
  const ctx = buildRenderContext(site, source, VIEWER, decisions);
  return {
    ctx,
    html: renderToStaticMarkup(SitePageView({ page: site.pages[0], ctx })),
  };
}

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeDeep(child);
  Object.freeze(value);
}

beforeAll(() => {
  // Evidence freshness is checked at render time; pin that clock explicitly.
  jest.useFakeTimers();
  jest.setSystemTime(new Date(NOW));
});
afterAll(() => jest.useRealTimers());

describe("editorial projection boundary", () => {
  const scopes: { name: string; query: FYDQuery }[] = [
    { name: "all", query: { kind: "all" } },
    { name: "reference", query: { kind: "reference", objectIds: ["public-record", "private-record", "hidden-record", "missing-record"] } },
    { name: "related", query: { kind: "related", from: "business", predicate: "offers" } },
  ];

  test.each(scopes)("$name queries withhold private and site-hidden records from editorial surfaces", ({ query }) => {
    const source = graph();
    const site = spec([
      section("EditorialAtlas", query),
      section("EditorialKnowledge", query),
      section("EditorialPublications", query),
    ]);
    // Deactivation on another page still applies to every rendered surface.
    const deactivation = section("EditorialStory", { kind: "static" });
    deactivation.presentation.hiddenObjectIds = ["hidden-record"];
    site.pages.push({ slug: "archive", title: "Archive", navLabel: "Archive", sections: [deactivation] });
    const { html } = render(source, site);

    expect(html).toContain("Stoneware Workshop");
    expect(html).toContain("Stoneware Workshop published description");
    expect(html).toContain(`href="${ORIGIN}/public-record"`);
    for (const id of ["private-record", "hidden-record"]) {
      const withheld = source.objects.find((o) => o.id === id)!;
      expect(html).not.toContain(withheld.title);
      expect(html).not.toContain(withheld.description);
      expect(html).not.toContain(`${ORIGIN}/${id}`);
    }
  });

  test("the owner query also withholds a private business identity", () => {
    const source = graph();
    source.objects[0].visibility = "private";
    const site = spec([section("EditorialHero", { kind: "owner" })]);
    const { html } = render(source, site);
    expect(html).not.toContain("Cedar Ceramics");
    expect(html).not.toContain('class="ed-hero"');
  });

  test("records without verified evidence cannot publish titles, descriptions, status, dates, or links", () => {
    const source = graph();
    const noEvidence = object("unbound", "Unsupported Capacity Promise", {
      fields: { url: "/unsupported-capacity", status: "unsupported-status", date: "2027-02-14" },
      provenance: { kind: "website-derived", ref: "", derivedAt: NOW },
    });
    const stale = object("stale", "Expired Delivery Promise", {
      provenance: { kind: "website-derived", ref: "website-ingestion:https://cedar.example/expired", derivedAt: "2024-01-01T00:00:00.000Z" },
    });
    const overlay = object("overlay", "Unauthenticated Inventory Claim", {
      provenance: { kind: "overlay-authored", ref: "demo-overlay:inventory", derivedAt: NOW },
    });
    source.objects.push(noEvidence, stale, overlay);
    const { html } = render(source, spec([
      section("EditorialAtlas"),
      section("EditorialKnowledge"),
      section("EditorialPublications"),
    ]));
    expect(html).toContain("Stoneware Workshop");
    for (const unsupported of [noEvidence, stale, overlay]) {
      expect(html).not.toContain(unsupported.title);
      expect(html).not.toContain(unsupported.description);
      expect(html).not.toContain(`href="${ORIGIN}${unsupported.fields.url}"`);
    }
    expect(html).not.toContain("unsupported-status");
    expect(html).not.toContain("2027-02-14");
  });

  test("field HIDE decisions remove verified URL, status, and date without removing the record", () => {
    const source = graph();
    const decisions: FieldVisibilityDecision[] = ["url", "status", "date"].map((field) => ({
      objectId: "public-record",
      field,
      policy: "hide",
      decidedBy: "owner",
      decidedAt: NOW,
      source: "owner_override",
      version: 1,
    }));
    const query: FYDQuery = { kind: "reference", objectIds: ["public-record"] };
    const site = spec([section("EditorialAtlas", query), section("EditorialPublications", query)]);
    const visible = render(source, site).html;
    expect(visible).toContain('href="https://cedar.example/public-record"');
    expect(visible).toContain(">Available</span>");
    expect(visible).toContain("2026-09-28");

    const hidden = render(source, site, decisions);
    expect(hidden.html).toContain("Stoneware Workshop");
    expect(hidden.html).not.toContain('href="https://cedar.example/public-record"');
    expect(hidden.html).not.toContain(">Available</span>");
    expect(hidden.html).not.toContain("2026-09-28");
    expect(hidden.ctx.graph.objects.find((o) => o.id === "public-record")!.fields).toEqual({});
    expect(source.objects.find((o) => o.id === "public-record")!.fields.url).toBe("/public-record");
  });

  test("rendering is stable and cannot mutate the source graph or presentation spec", () => {
    const source = graph();
    const site = spec([section("EditorialAtlas"), section("EditorialPublications")]);
    const before = JSON.stringify({ source, site });
    freezeDeep(source);
    freezeDeep(site);
    const first = render(source, site);
    const second = render(source, site);
    expect(first.html).toContain("Stoneware Workshop");
    expect(second.html).toBe(first.html);
    expect(renderToStaticMarkup(SitePageView({ page: site.pages[0], ctx: first.ctx }))).toBe(first.html);
    expect(JSON.stringify({ source, site })).toBe(before);
    expect(first.ctx.graph).not.toBe(source);
  });

  test("one unchanged editorial composition renders different non-PING businesses from their graphs", () => {
    const site = spec([
      section("EditorialHero", { kind: "owner" }),
      section("EditorialAtlas"),
      section("EditorialKnowledge"),
      section("EditorialPublications"),
      section("EditorialStory", { kind: "static" }, { panels: [{ label: "01", title: "Our approach", copy: "Explore what we publish." }] }),
      section("EditorialProof", { kind: "static" }),
    ]);
    const ceramics = graph();
    const repair: ObjectGraph = {
      objects: [
        object("business", "Northstar Bicycle Repair", { schema: "example.business@1" }),
        object("public-record", "Wheel Truing Service", { schema: "example.service@1" }),
      ],
      relationships: [ceramics.relationships[0]],
    };
    const first = render(ceramics, site).html;
    const second = render(repair, site).html;
    expect(first).toContain("Cedar Ceramics");
    expect(first).toContain("Stoneware Workshop");
    expect(second).toContain("Northstar Bicycle Repair");
    expect(second).toContain("Wheel Truing Service");
    expect(second).not.toContain("Cedar Ceramics");
    expect(second).not.toContain("Stoneware Workshop");
    expect(second).not.toContain("PING");
    for (const s of site.pages[0].sections) {
      expect(first).toContain(`id="${s.id}"`);
      expect(second).toContain(`id="${s.id}"`);
    }
  });
});

describe("editorial URL boundary", () => {
  test.each([
    ["/catalogue", "", "/catalogue"],
    ["/catalogue?sort=recent#clay", ORIGIN, `${ORIGIN}/catalogue?sort=recent#clay`],
    ["#published-records", ORIGIN, "#published-records"],
    ["/", "http://localhost:3101", "http://localhost:3101/"],
  ])("accepts bounded local destination %s with origin %s", (value, origin, expected) => {
    expect(editorialHref(value, origin)).toBe(expected);
  });

  const hostileDestinations = [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)",
    "file:///etc/passwd", "blob:https://cedar.example/token",
    "https://elsewhere.example/", "//elsewhere.example/", "/\\elsewhere.example/",
    " /catalogue", "/cat\talogue", "/cat\nalogue", "/cat\u0000alogue", "/cat\u007falogue",
    "#unsafe fragment", "", undefined,
  ];

  test.each(hostileDestinations)("rejects an unsupported or hostile destination %p", (value) => {
    expect(editorialHref(value, ORIGIN)).toBeUndefined();
  });

  test.each([
    "javascript:alert(1)", "//elsewhere.example", "https://user:password@cedar.example",
    "https://cedar.example/path", "https://cedar.example?redirect=elsewhere", "https://cedar.example#fragment",
  ])("rejects a malformed source origin %s", (origin) => {
    expect(editorialHref("/catalogue", origin)).toBeUndefined();
  });

  test("record links, hero actions, proof actions, and story panels all validate destinations", () => {
    const source = graph();
    source.objects.push(object("unsafe-url", "Record with unsafe link", { fields: { url: "javascript:alert(1)" } }));
    const actions = [
      { label: "Read catalogue", href: "/catalogue" },
      { label: "Unsafe action", href: "data:text/html,unsafe" },
    ];
    const site = spec([
      section("EditorialHero", { kind: "owner" }, { actions }),
      section("EditorialPublications"),
      section("EditorialStory", { kind: "static" }, {
        panels: [
          { label: "01", title: "Read our process", copy: "Published process", href: "#process" },
          { label: "02", title: "Unsafe panel", copy: "Untrusted destination", href: "//elsewhere.example/" },
        ],
        actions,
      }),
      section("EditorialProof", { kind: "static" }, { actions, previewEndpoint: "/api/public-preview" }),
    ]);
    const { html } = render(source, site);
    expect(html).toContain("Record with unsafe link");
    expect(html).toContain(`href="${ORIGIN}/catalogue"`);
    expect(html).toContain('href="#process"');
    expect(html).toContain(`href="${ORIGIN}/public-record"`);
    expect(html).not.toMatch(/javascript:|data:text\/html|\/\/elsewhere\.example/i);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith(`${ORIGIN}/`) || href.startsWith("#")).toBe(true);
  });
});
