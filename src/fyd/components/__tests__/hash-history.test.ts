/**
 * Item 3 regression: hash / history invariant.
 *
 * Node env. Pure decision functions (shouldResetScroll, fragment routing)
 * plus source-level assertions: no unconditional diagnostic logging, and
 * deep-link stability (section-id set identical across regenerations,
 * including ask/services/contact) over both site fixtures.
 */
import * as fs from "fs";
import * as path from "path";
import { shouldResetScroll } from "@/components/scroll-to-top";
import { resolveFragmentAction, performFragmentScroll } from "@/components/lenis-provider";

describe("shouldResetScroll truth table", () => {
  test("pathname changed + no hash + push -> reset", () => {
    expect(shouldResetScroll({ pathnameChanged: true, hash: "", isPopstate: false })).toBe(true);
  });
  test("any non-empty hash -> never reset", () => {
    expect(shouldResetScroll({ pathnameChanged: true, hash: "#ask", isPopstate: false })).toBe(
      false,
    );
    expect(shouldResetScroll({ pathnameChanged: false, hash: "#ask", isPopstate: false })).toBe(
      false,
    );
    expect(shouldResetScroll({ pathnameChanged: true, hash: "#ask", isPopstate: true })).toBe(
      false,
    );
  });
  test("popstate -> never reset", () => {
    expect(shouldResetScroll({ pathnameChanged: true, hash: "", isPopstate: true })).toBe(false);
  });
  test("same pathname -> never reset", () => {
    expect(shouldResetScroll({ pathnameChanged: false, hash: "", isPopstate: false })).toBe(false);
  });
});

describe("fragment router decisions", () => {
  test("direct nav with #ask resolves scroll-to-target and never the reset path", () => {
    const action = resolveFragmentAction("#ask");
    expect(action).toEqual({ kind: "scroll-to-target", id: "ask" });
    // The reset decision for the same navigation is false: the two paths
    // cannot fight.
    expect(shouldResetScroll({ pathnameChanged: false, hash: "#ask", isPopstate: false })).toBe(
      false,
    );
  });

  test("direct nav performs a coordinated scroll-to-target (stub scroller log)", () => {
    const calls: string[] = [];
    const result = performFragmentScroll("ask", {
      getElementById: (id) =>
        id === "ask" ? { scrollIntoView: () => calls.push("native") } : null,
      chromeTopPx: () => 0,
      reducedMotion: () => false,
    });
    expect(result).toBe("native");
    expect(calls).toEqual(["native"]);
  });

  test("hashchange to #ask routes through Lenis with the chrome offset when active", () => {
    const calls: Array<{ target: unknown; opts?: unknown }> = [];
    const result = performFragmentScroll("ask", {
      getElementById: () => ({
        scrollIntoView: () => {
          throw new Error("native must not run while Lenis owns scroll");
        },
      }),
      lenisScrollTo: (target, opts) => {
        calls.push({ target, opts });
      },
      chromeTopPx: () => 64,
      reducedMotion: () => false,
    });
    expect(result).toBe("lenis");
    expect(calls).toHaveLength(1);
    expect(calls[0].opts).toEqual({ offset: -64, immediate: false });
  });

  test("hashchange to empty resolves restore-previous (no invented position)", () => {
    expect(resolveFragmentAction("")).toEqual({ kind: "restore-previous" });
  });

  test("missing target leaves scroll alone", () => {
    const missing: string[] = [];
    const result = performFragmentScroll("no-such-section", {
      getElementById: () => null,
      chromeTopPx: () => 0,
      reducedMotion: () => false,
      onMissingTarget: (id) => missing.push(id),
    });
    expect(result).toBe("missing-target");
    expect(missing).toEqual(["no-such-section"]);
  });

  test("lone # is ignored", () => {
    expect(resolveFragmentAction("#")).toEqual({ kind: "ignore" });
  });
});

test("no unconditional diagnostic logging in scroll-to-top", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "components", "scroll-to-top.tsx"),
    "utf8",
  );
  expect(src).not.toMatch(/console\.log/);
  expect(src).not.toContain("SCROLLTOTOP_DIAGNOSTIC");
});

function sectionIds(graph: unknown): string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderToStaticMarkup } = require("react-dom/server");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { VisitorExperience } = require("../visitor-experience");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateSiteSpec } = require("../../proceduralize/generator");
  const spec = generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00Z" });
  const ctx = {
    graph,
    spec,
    siteId: "test",
    viewer: { viewerId: null, displayName: null },
  };
  const html: string = renderToStaticMarkup(React.createElement(VisitorExperience, { ctx }));
  const ids = Array.from(html.matchAll(/ id="([^"]+)"/g)).map((m) => m[1]);
  return Array.from(new Set(ids)).sort();
}

test("deep-link stability: section ids stable across regenerations on both sites", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { COPPERSMITH_GRAPH } = require("../../proceduralize/__fixtures__/coppersmith-graph");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { HAPPY_PLACE_GRAPH } = require("../../proceduralize/__fixtures__/happy-place-graph");
  for (const [name, graph] of [
    ["coppersmith", COPPERSMITH_GRAPH],
    ["happy-place", HAPPY_PLACE_GRAPH],
  ] as const) {
    const first = sectionIds(graph);
    const second = sectionIds(graph);
    expect(second).toEqual(first, `${name}: section ids churned across regeneration`);
    expect(first).toContain("ask");
    expect(first).toContain("contact");
    expect(first).toContain("business");
  }
});
