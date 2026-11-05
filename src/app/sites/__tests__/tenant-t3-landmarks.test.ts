/**
 * tenant-t3-landmarks.test.ts — pins Website UI audit 2026-11-01
 * finding T3 against main's architecture.
 *
 * The finding: two <h1>s and nested <main> landmarks on every tenant
 * page (root layout <main id="main-content"> + tenant page <main> +
 * shell brand <h1> + Hero <h1>).
 *
 * On main the h1 half was already satisfied by the VisitorExperience
 * rebuild: the shell brand is an anchor (.ve-wordmark) and the hero
 * <h1> is the only heading-one on the public page. The nested-<main>
 * half was still real: every tenant page file rendered its own <main>
 * inside the root layout's <main>. This lane changed those wrappers
 * to <div>. These tests pin both halves:
 *
 * 1. No tenant page file under src/app/sites renders a <main> (the
 *    root layout owns the single landmark).
 * 2. The rendered public storefront carries exactly one <h1> and no
 *    <main> of its own (Coppersmith fixture graph — a fixture read,
 *    not a tenant edit).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VisitorExperience } from "@/fyd/components/visitor-experience";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";

const TENANT_PAGES = [
  "app/sites/coppersmith-plumbing/page.tsx",
  "app/sites/happy-place/page.tsx",
  "app/sites/[siteId]/page.tsx",
  "app/sites/ping-fyd/page.tsx",
];

describe("tenant audit T3: one <main> and one <h1> per tenant page", () => {
  test("no tenant page file renders its own <main>", () => {
    const srcRoot = join(__dirname, "..", "..", ".."); // src/
    for (const rel of TENANT_PAGES) {
      const source = readFileSync(join(srcRoot, rel), "utf8");
      expect(source).not.toContain("<main");
      expect(source).not.toContain("</main>");
    }
  });

  test("the public storefront render has exactly one <h1> and no <main>", () => {
    const ctx = {
      graph: COPPERSMITH_GRAPH,
      spec: generateSiteSpec(COPPERSMITH_GRAPH, {
        generatedAt: "2026-10-07T00:00:00.000Z",
      }),
      viewer: { viewerId: null, displayName: null },
      siteId: "coppersmith-plumbing",
    };
    const html = renderToStaticMarkup(createElement(VisitorExperience, { ctx }));
    expect(html.length).toBeGreaterThan(1000);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("<main");
  });
});
