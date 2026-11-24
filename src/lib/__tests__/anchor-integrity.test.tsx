import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import TiersPage from "@/app/tiers/page";
import { buildPingFydOffersJsonLd } from "@/lib/structured-data";

/**
 * Anchor integrity standing gate (2026-11-24).
 *
 * The defect this guards: the offers anchor fix of 2026-11-23. A
 * published label pointed at an in-page anchor no element carried,
 * so the link landed nowhere. The /tiers leg is rendered ground
 * truth: the four tier block ids must render, and every fragment in
 * the canonical offers JSON-LD must resolve into them. The census
 * leg is static by necessity (most pages do not render under jest):
 * every literal fragment href in the app, component, and FYD UI
 * trees must name an id declared in the target page's own subtree
 * or in shared components. "#top" is excluded: the HTML spec
 * scrolls to the document top for it with no element required.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function sourcesUnder(rel: string): { path: string; source: string }[] {
  const base = join(ROOT, rel);
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
        out.push({ path: full, source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(base);
  return out;
}

const TREES = ["src/app", "src/components", "src/fyd/ui"];
const ALL = TREES.flatMap(sourcesUnder);
const SHARED = ALL.filter(
  ({ path }) => !path.includes("/src/app/"),
);

function declaredIds(files: { source: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const { source } of files) {
    for (const m of source.matchAll(/\bid=["']([a-z0-9-]+)["']/g)) ids.add(m[1]);
    for (const m of source.matchAll(/\bid=\{["']([a-z0-9-]+)["']\}/g)) ids.add(m[1]);
    for (const m of source.matchAll(/\bid:\s*["']([a-z0-9-]+)["']/g)) ids.add(m[1]);
  }
  return ids;
}

type FragmentLink = { from: string; path: string | null; fragment: string };

function fragmentLinks(): FragmentLink[] {
  const out: FragmentLink[] = [];
  for (const { path, source } of ALL) {
    for (const m of source.matchAll(/href=["']#([a-z0-9-]+)["']/g)) {
      out.push({ from: path, path: null, fragment: m[1] });
    }
    for (const m of source.matchAll(/href=["'](\/[a-z0-9/-]*)#([a-z0-9-]+)["']/g)) {
      out.push({ from: path, path: m[1] === "" ? "/" : m[1], fragment: m[2] });
    }
  }
  return out;
}

describe("/tiers rendered anchors", () => {
  const html = renderToStaticMarkup(<TiersPage />);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

  it("renders the four tier block ids", () => {
    expect([...ids].sort()).toEqual(
      expect.arrayContaining(["ai-workspace", "concierge", "hosted", "self-hosted"]),
    );
  });

  it("every offers JSON-LD url fragment resolves to a rendered id", () => {
    const ld = buildPingFydOffersJsonLd("https://pingfyd.com") as {
      offers: { url?: string }[];
    };
    for (const offer of ld.offers) {
      const fragment = offer.url?.split("#")[1];
      expect(fragment).toBeTruthy();
      expect(ids.has(fragment!)).toBe(true);
    }
  });
});

describe("fragment href census", () => {
  const links = fragmentLinks().filter((l) => l.fragment !== "top");
  const sharedIds = declaredIds(SHARED);

  it("discovers the site's fragment links", () => {
    expect(links.length).toBeGreaterThanOrEqual(10);
  });

  it("every cross-page fragment resolves in its target subtree or shared components", () => {
    for (const link of links) {
      if (link.path === null) continue;
      const subtree = ALL.filter(({ path }) =>
        link.path === "/"
          ? path.includes("/src/app/page.tsx") || path.includes("/src/fyd/ui/home")
          : path.includes(`/src/app${link.path}/`),
      );
      const ids = new Set([...declaredIds(subtree), ...sharedIds]);
      expect({ link, resolves: ids.has(link.fragment) }).toEqual({
        link,
        resolves: true,
      });
    }
  });

  it("every same-page fragment is declared somewhere in the composed source set", () => {
    const allIds = declaredIds(ALL);
    for (const link of links) {
      if (link.path !== null) continue;
      expect({ link, resolves: allIds.has(link.fragment) }).toEqual({
        link,
        resolves: true,
      });
    }
  });
});
