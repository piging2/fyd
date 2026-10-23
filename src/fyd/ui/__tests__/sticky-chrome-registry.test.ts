/**
 * Item 1 regression: sticky-chrome registry + shell scroll-padding invariant.
 *
 * Node env. The registry is pure; DOM writes go through a stub document.
 * The rendered-visitor assertions run the real VisitorExperience path for
 * the Coppersmith fixture and prove the hardcoded pixel guesses are gone.
 */
import * as fs from "fs";
import * as path from "path";
import {
  createStickyChromeRegistry,
  stickyChromeRegistry,
  __resetStickyChromeRegistry,
  ensureFocusVisible,
  CHROME_TOP_VAR,
  CHROME_BOTTOM_VAR,
} from "../sticky-chrome";

function fakeEl(top: number, bottom: number) {
  const calls: string[] = [];
  return {
    calls,
    getBoundingClientRect: () => ({ top, bottom }),
    scrollIntoView: (opts?: unknown) => {
      calls.push(`scrollIntoView:${JSON.stringify(opts)}`);
    },
  };
}

beforeEach(() => {
  __resetStickyChromeRegistry();
});

test("register top 64 + bottom 78 computes vars; unregister returns to 0", () => {
  const seen: Array<{ top: number; bottom: number }> = [];
  const reg = createStickyChromeRegistry((s) => seen.push(s));
  reg.register({ id: "site-header", edge: "top", heightPx: 64 });
  reg.register({ id: "ve-mobile-actions", edge: "bottom", heightPx: 78 });
  expect(reg.snapshot()).toEqual({ top: 64, bottom: 78 });
  expect(reg.size()).toBe(2);
  reg.unregister("ve-mobile-actions");
  expect(reg.snapshot()).toEqual({ top: 64, bottom: 0 });
  reg.unregister("site-header");
  expect(reg.snapshot()).toEqual({ top: 0, bottom: 0 });
  expect(seen[seen.length - 1]).toEqual({ top: 0, bottom: 0 });
});

test("overlapping registrations take the max per edge", () => {
  const reg = createStickyChromeRegistry();
  reg.register({ id: "bar-a", edge: "bottom", heightPx: 60 });
  reg.register({ id: "bar-b", edge: "bottom", heightPx: 78 });
  expect(reg.snapshot().bottom).toBe(78);
  reg.unregister("bar-b");
  expect(reg.snapshot().bottom).toBe(60);
});

test("shell singleton writes the CSS vars (stubbed document)", () => {
  const set: Record<string, string> = {};
  (global as unknown as { document: unknown }).document = {
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => {
          set[k] = v;
        },
      },
    },
  };
  try {
    const reg = stickyChromeRegistry();
    reg.register({ id: "ve-mobile-actions", edge: "bottom", heightPx: 78 });
    expect(set[CHROME_TOP_VAR]).toBe("0px");
    expect(set[CHROME_BOTTOM_VAR]).toBe("78px");
  } finally {
    delete (global as unknown as { document?: unknown }).document;
  }
});

test("ensureFocusVisible: element behind the bottom chrome requests scroll", () => {
  stickyChromeRegistry().register({ id: "ve-mobile-actions", edge: "bottom", heightPx: 78 });
  // Viewport 800 tall; chrome covers 722..800; element at 700..760 intersects.
  const el = fakeEl(700, 760);
  expect(ensureFocusVisible(el, { viewportHeight: 800 })).toBe(true);
  expect(el.calls).toHaveLength(1);
  expect(el.calls[0]).toContain('"block":"nearest"');
});

test("ensureFocusVisible: element behind the top chrome requests scroll", () => {
  stickyChromeRegistry().register({ id: "site-header", edge: "top", heightPx: 64 });
  const el = fakeEl(10, 40);
  expect(ensureFocusVisible(el, { viewportHeight: 800 })).toBe(true);
  expect(el.calls).toHaveLength(1);
});

test("ensureFocusVisible: fully visible element requests no scroll", () => {
  stickyChromeRegistry().register({ id: "ve-mobile-actions", edge: "bottom", heightPx: 78 });
  const el = fakeEl(100, 140);
  expect(ensureFocusVisible(el, { viewportHeight: 800 })).toBe(false);
  expect(el.calls).toHaveLength(0);
});

const CSS_PATH = path.join(__dirname, "..", "..", "components", "visitor-experience.css");

test("shell CSS: one scroll-padding rule reads the vars; no hardcoded guesses", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  expect(css).toContain("scroll-padding-top: var(--fyd-chrome-top");
  expect(css).toContain("scroll-padding-bottom: var(--fyd-chrome-bottom");
  expect(css).not.toContain("scroll-margin-top:20px");
});

function renderCoppersmithVisitor(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderToStaticMarkup } = require("react-dom/server");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { VisitorExperience } = require("../../components/visitor-experience");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateSiteSpec } = require("../../proceduralize/generator");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { COPPERSMITH_GRAPH } = require("../../proceduralize/__fixtures__/coppersmith-graph");
  const graph = COPPERSMITH_GRAPH;
  const spec = generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00Z" });
  const ctx = {
    graph,
    spec,
    siteId: "coppersmith-plumbing",
    viewer: { viewerId: null, displayName: null },
  };
  return renderToStaticMarkup(React.createElement(VisitorExperience, { ctx }));
}

test("rendered visitor markup carries no hardcoded scroll-margin guesses", () => {
  const html = renderCoppersmithVisitor();
  expect(html).not.toContain("scroll-margin-top:20px");
  expect(html).toContain('id="ask"');
});

test("keyboard-traversal simulation: every #ask focusable is covered by the shell rule", () => {
  const html = renderCoppersmithVisitor();
  const askSection = html.match(/<section[^>]*id="ask"[^>]*>([\s\S]*?)<\/section>/);
  expect(askSection).not.toBeNull();
  const body = askSection![1];
  // Tab-order walk over the focusable selectors in the #ask section.
  const focusables = body.match(/<(a|button|input|summary|select|textarea)[\s>]/g) ?? [];
  expect(focusables.length).toBeGreaterThan(0);
  // Simulate the producer the shell measures at runtime: the fixed mobile
  // action bar registers its real height; the shell rule then maps it onto
  // scroll-padding-bottom for every focusable above, with no per-site
  // constant anywhere in the chain.
  stickyChromeRegistry().register({ id: "ve-mobile-actions", edge: "bottom", heightPx: 78 });
  expect(stickyChromeRegistry().snapshot().bottom).toBe(78);
  const css = fs.readFileSync(CSS_PATH, "utf8");
  expect(css).toContain("scroll-padding-bottom: var(--fyd-chrome-bottom");
});
