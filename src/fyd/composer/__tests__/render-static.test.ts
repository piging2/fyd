/**
 * Lane 3 composer battery: static spec-to-HTML serializer (backlog B2).
 *
 * The serializer covers exactly the components compile.ts mapSection can
 * emit, serializes only text the spec itself carries, and is byte
 * deterministic. Every test maps to a B2 scope condition.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { FYDSiteSpec } from "@/fyd/sitespec/types";
import { compileTemplate } from "../compile";
import {
  STATIC_RENDER_COMPONENTS,
  escapeHtml,
  isStaticallyCovered,
  renderSpecToHtml,
} from "../render-static";

const FIX = join(__dirname, "fixtures");
const manifestRaw = JSON.parse(readFileSync(join(FIX, "template-manifest.json"), "utf8"));
const profileRaw = JSON.parse(readFileSync(join(FIX, "profile.json"), "utf8"));
const OPTS = { tenant: "coppersmith-plumbing", ownerObjectId: "website-business-coppersmith-test" };

function compiledSpec(): FYDSiteSpec {
  return compileTemplate(manifestRaw, profileRaw, OPTS).spec;
}

/** Deep key-shuffle: rebuild an object with reversed key order everywhere. */
function shuffleKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(shuffleKeys);
  const rec = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort().reverse()) out[k] = shuffleKeys(rec[k]);
  return out;
}

const GOLDEN_SPEC: FYDSiteSpec = {
  kind: "fyd.sitespec@1",
  ownerObjectId: "website-business-golden-test",
  version: 1,
  generator: {
    name: "fyd-site-generator",
    version: "test",
    generatedAt: "2026-11-19T00:00:00.000Z",
  },
  themeTokens: {
    accent: "#C9A227",
    accentForeground: "#1c1917",
    surface: "#FFFFFF",
    ink: "#232033",
    radius: "lg",
    fontDisplay: "Playfair Display, Georgia, serif",
    fontBody: "Geist, system-ui, sans-serif",
    typography: { base: 16, ratio: 1.25 },
    layoutCharacter: "CRAFT",
  },
  navigation: [
    { label: "Home", pageSlug: "home" },
    { label: "About", pageSlug: "about" },
  ],
  pages: [
    {
      slug: "home",
      title: "Home",
      navLabel: "Home",
      sections: [
        {
          id: "home:Hero:0",
          component: "Hero",
          query: { kind: "owner" },
          presentation: { heading: "Golden Fixture Co", copy: "We fix things." },
        },
        {
          id: "home:Services:1",
          component: "Services",
          query: {
            kind: "related",
            from: "website-business-golden-test",
            predicate: "provides",
          },
          presentation: {},
        },
        {
          id: "home:Products:2",
          component: "Products",
          query: { kind: "all" },
          presentation: { heading: "Products" },
        },
        {
          id: "home:CTA:3",
          component: "CTA",
          query: { kind: "owner" },
          presentation: { heading: "Call us", hidden: true },
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      navLabel: "About",
      sections: [
        {
          id: "about:BusinessSummary:0",
          component: "BusinessSummary",
          query: { kind: "owner" },
          presentation: { copy: "First para.\n\nSecond para." },
        },
      ],
    },
  ],
  provenance: {
    source: "website-ingestion",
    claimKind: "website_statement",
    note: "golden test fixture",
  },
};

const GOLDEN_HOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home</title>
<style>
:root {
  --fyd-accent: #C9A227;
  --fyd-accent-foreground: #1c1917;
  --fyd-font-body: Geist, system-ui, sans-serif;
  --fyd-font-display: Playfair Display, Georgia, serif;
  --fyd-ink: #232033;
  --fyd-surface: #FFFFFF;
  --fyd-type-base: 16px;
  --fyd-type-ratio: 1.25;
}
body { margin: 0; font-family: var(--fyd-font-body); color: var(--fyd-ink); background: var(--fyd-surface); }
h1, h2 { font-family: var(--fyd-font-display); }
a { color: var(--fyd-accent); }
</style>
</head>
<body data-layout-character="CRAFT">
<header>
<h1>Home</h1>
<nav>
<ul>
<li><a href="home.html" aria-current="page">Home</a></li>
<li><a href="about.html">About</a></li>
</ul>
</nav>
</header>
<main>
<section data-component="Hero" id="home:Hero:0">
<h2>Golden Fixture Co</h2>
<p>We fix things.</p>
</section>
<section data-component="Services" id="home:Services:1">
</section>
<!-- uncovered-section component="Products" section="home:Products:2" -->
</main>
</body>
</html>
`;

describe("B2.1 coverage set is exactly the composer's emittable components", () => {
  it("pins the 12 components compile.ts mapSection can emit, no more", () => {
    expect([...STATIC_RENDER_COMPONENTS]).toEqual([
      "AskFYD",
      "BusinessSummary",
      "CTA",
      "Contact",
      "Gallery",
      "Hero",
      "Locations",
      "ObjectGrid",
      "People",
      "RecentObjects",
      "Services",
      "SocialProof",
    ]);
    expect(isStaticallyCovered("Hero")).toBe(true);
    expect(isStaticallyCovered("Products")).toBe(false);
    expect(isStaticallyCovered("Posts")).toBe(false);
  });
});

describe("B2.2 golden render", () => {
  it("renders the golden spec's home page byte-for-byte", () => {
    const { pages } = renderSpecToHtml(GOLDEN_SPEC);
    expect(pages[0].slug).toBe("home");
    expect(pages[0].html).toBe(GOLDEN_HOME_HTML);
    expect(pages[0].bytes).toBe(1117);
  });

  it("splits multi-paragraph copy into one <p> per paragraph", () => {
    const { pages } = renderSpecToHtml(GOLDEN_SPEC);
    expect(pages[1].html).toContain("<p>First para.</p>\n<p>Second para.</p>");
  });
});

describe("B2.3 determinism", () => {
  it("double render of a compiled fixture spec is byte-identical", () => {
    const spec = compiledSpec();
    const a = renderSpecToHtml(spec);
    const b = renderSpecToHtml(spec);
    expect(a.pages.map((p) => p.html)).toEqual(b.pages.map((p) => p.html));
    expect(a.manifest).toEqual(b.manifest);
  });

  it("spec key order does not change the output bytes", () => {
    const spec = compiledSpec();
    const a = renderSpecToHtml(spec);
    const b = renderSpecToHtml(shuffleKeys(spec) as FYDSiteSpec);
    expect(b.pages.map((p) => p.html)).toEqual(a.pages.map((p) => p.html));
    expect(b.manifest.totalBytes).toBe(a.manifest.totalBytes);
  });
});

describe("B2.4 coverage manifest correctness", () => {
  it("names uncovered components and suppressed hidden sections, never drops silently", () => {
    const { manifest } = renderSpecToHtml(GOLDEN_SPEC);
    expect(manifest.uncovered).toEqual([
      { page: "home", sectionId: "home:Products:2", component: "Products" },
    ]);
    expect(manifest.suppressed).toEqual([
      { page: "home", sectionId: "home:CTA:3", component: "CTA", reason: "hidden" },
    ]);
    expect(manifest.totalSections).toBe(5);
    expect(manifest.sectionsRendered).toBe(3);
    expect(manifest.sectionsWithText).toBe(2);
    expect(
      manifest.sectionsRendered + manifest.uncovered.length + manifest.suppressed.length,
    ).toBe(manifest.totalSections);
  });

  it("the compiled fixture spec renders with zero uncovered sections", () => {
    const { manifest } = renderSpecToHtml(compiledSpec());
    expect(manifest.uncovered).toEqual([]);
    expect(manifest.sectionsRendered).toBe(manifest.totalSections);
  });
});

describe("B2.5 escaping", () => {
  it("escapes HTML metacharacters in spec text", () => {
    const spec: FYDSiteSpec = {
      ...GOLDEN_SPEC,
      pages: [
        {
          slug: "home",
          title: "Home",
          navLabel: "Home",
          sections: [
            {
              id: "home:Hero:0",
              component: "Hero",
              query: { kind: "owner" },
              presentation: {
                heading: `A <B> & "C" 'D'`,
                copy: `<script>alert(1)</script>`,
              },
            },
          ],
        },
      ],
    };
    const { pages } = renderSpecToHtml(spec);
    expect(pages[0].html).toContain(
      "<h2>A &lt;B&gt; &amp; &quot;C&quot; &#39;D&#39;</h2>",
    );
    expect(pages[0].html).toContain(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(pages[0].html).not.toContain("<script>");
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("B2.6 self-contained output", () => {
  it("emits no JavaScript and no external assets", () => {
    const { pages } = renderSpecToHtml(compiledSpec());
    for (const page of pages) {
      expect(page.html).not.toContain("<script");
      expect(page.html).not.toContain("src=");
      expect(page.html).not.toMatch(/href="https?:\/\//);
    }
  });
});
