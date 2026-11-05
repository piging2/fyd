/**
 * tenant-t13-validator-footer.test.ts — pins Website UI audit
 * 2026-11-01 finding T13 (slice baa7e8e) against main's architecture.
 *
 * The finding: the shared tenant shell rendered a "Validator notes
 * (n)" details block, listing internal spec validation findings, in
 * the public footer of every generated customer site. On main the
 * shell was restructured (commit 69d4ad80): the public SiteClient
 * renders VisitorExperience and never passes findings to it; the
 * findings block survives only inside the owner-only editor client,
 * which is dynamically imported solely on owner surfaces. The slice's
 * `ownerConsole &&` gate is therefore already satisfied structurally
 * — and until now, unpinned. These tests are the pin:
 *
 * 1. The rendered public storefront carries no validator-findings
 *    block (rendered-output assertion, Coppersmith fixture graph —
 *    a fixture read, not a tenant edit).
 * 2. The string "Validator notes" exists in exactly one production
 *    source file: the owner editor client.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { VisitorExperience } from "@/fyd/components/visitor-experience";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";

describe("tenant audit T13: validator findings stay off public tenant pages", () => {
  test("the public storefront render carries no validator-findings block", () => {
    const ctx = {
      graph: COPPERSMITH_GRAPH,
      spec: generateSiteSpec(COPPERSMITH_GRAPH, {
        generatedAt: "2026-10-07T00:00:00.000Z",
      }),
      viewer: { viewerId: null, displayName: null },
      siteId: "coppersmith-plumbing",
    };
    const html = renderToStaticMarkup(createElement(VisitorExperience, { ctx }));
    // Precondition: a real page rendered, so the absence assertions
    // below are not vacuous.
    expect(html.length).toBeGreaterThan(1000);
    expect(html).not.toContain("Validator notes");
    expect(html).not.toContain("Validator findings");
  });

  test("'Validator notes' exists only in the owner editor client", () => {
    const srcRoot = join(__dirname, "..", "..", ".."); // src/
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(p);
        } else if (/\.tsx?$/.test(name)) {
          if (readFileSync(p, "utf8").includes("Validator notes")) {
            hits.push(p.slice(srcRoot.length + 1).split("\\").join("/"));
          }
        }
      }
    };
    walk(srcRoot);
    expect(hits).toEqual(["app/sites/_shared/site-editor-client.tsx"]);
  });
});
