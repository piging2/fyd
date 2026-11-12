/**
 * UI FIXTURE HARNESS (Item 15 of the 2026-11-12 improvement tranche:
 * fixture-first evidence order for the six website UI findings).
 *
 * What this suite is: deterministic fixtures and source censuses that pin
 * the fixture-class findings (4, 5, 3, 6) and the code properties of the
 * browser-class findings (1, 2) so a regression fails the standard jest
 * gate instead of reaching a user. The loader fixtures execute the real
 * shipped public/fyd-circle-loader.js against a stub DOM with deferred
 * promises; nothing here touches the network or a browser.
 *
 * What this suite is NOT: browser verification. Findings 1 and 2 are
 * guarded here at the code-property level only (scroll padding present;
 * no native disabled attribute in the relationship buttons). Their
 * browser-level proof remains the lane's capture debt, unchanged.
 * The player fixture below exercises real server rendering; its interactive
 * timeout/focus/retry proof runs with npx tsx scripts/verify-episode-player.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EpisodePlayer } from "@/components/episode-player";
import { keyboardOrder } from "@/fyd/spatial/object-space";
import type { SpatialSpec } from "@/fyd/spatial/object-space";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

/* ------------------------------------------------------------------ */
/* Stub DOM, ported from the lane's proven loader proof harness.       */
/* ------------------------------------------------------------------ */
type StubEl = {
  tagName: string;
  children: StubEl[];
  style: Record<string, string>;
  attrs: Record<string, string>;
  onclick?: () => void;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  appendChild: (c: StubEl) => StubEl;
  click: () => void;
  innerHTML: string;
  firstChild: StubEl | null;
};

function makeEl(tag: string): StubEl {
  const el: StubEl = {
    tagName: (tag || "div").toUpperCase(),
    children: [],
    style: {},
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    click() {
      if (typeof this.onclick === "function") this.onclick();
    },
    innerHTML: "",
    firstChild: null,
  };
  Object.defineProperty(el, "innerHTML", {
    set(v: string) {
      if (v === "") el.children = [];
    },
    get() {
      return "";
    },
  });
  Object.defineProperty(el, "firstChild", {
    get() {
      return el.children[0] ?? null;
    },
  });
  return el;
}

const flush = () => new Promise((r) => setTimeout(r, 10));

function loadLoader(fetchImpl: (url: string) => Promise<unknown>) {
  const elements: Record<string, StubEl> = {};
  const opened: string[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, fetch: g.fetch };
  g.window = { open: (u: string) => opened.push(u) };
  g.document = {
    createElement: (t: string) => makeEl(t),
    getElementById: (id: string) => (elements[id] ??= makeEl("div")),
  };
  g.fetch = fetchImpl;
  const code = read("public/fyd-circle-loader.js");
  eval(code);
  const FydCircle = (
    g.window as { FydCircle: { mount: (el: StubEl, o: object) => void } }
  ).FydCircle;
  return {
    FydCircle,
    elements,
    opened,
    restore() {
      g.window = saved.window;
      g.document = saved.document;
      g.fetch = saved.fetch;
    },
  };
}

const okJson = (projection: object) => () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, projection }),
  });

/* ------------------------------------------------------------------ */
/* Findings 4 and 5: the publisher loader.                             */
/* ------------------------------------------------------------------ */
describe("loader fixtures (findings 4 and 5)", () => {
  test("capability-less projection renders a presentational span, never a dead button", async () => {
    const h = loadLoader(
      okJson({ name: "No Site Co", capabilities: [], background: { kind: "css", css: "#333" } }),
    );
    const host = makeEl("div");
    h.FydCircle.mount(host, { objectId: "x", apiBase: "https://a" });
    await flush();
    const node = host.firstChild;
    expect(node?.tagName).toBe("SPAN");
    expect(node?.getAttribute("role")).toBe("img");
    expect(typeof node?.onclick).not.toBe("function");
    node?.click();
    expect(h.opened).toHaveLength(0);
    h.restore();
  });

  test("website capability renders a real button that opens the site", async () => {
    const h = loadLoader(
      okJson({
        name: "Has Site",
        capabilities: [{ kind: "website", href: "https://shop.example/" }],
        background: { kind: "css", css: "#111" },
      }),
    );
    const host = makeEl("div");
    h.FydCircle.mount(host, { objectId: "y", apiBase: "https://a" });
    await flush();
    const node = host.firstChild;
    expect(node?.tagName).toBe("BUTTON");
    node?.click();
    expect(h.opened).toEqual(["https://shop.example/"]);
    h.restore();
  });

  test("remount race: a stale success resolving last cannot overwrite the fresh render", async () => {
    let resolveSlow: (() => void) | undefined;
    const h = loadLoader((url: string) =>
      url.includes("id=slow")
        ? new Promise((res) => {
            resolveSlow = () =>
              res({
                ok: true,
                json: () =>
                  Promise.resolve({
                    ok: true,
                    projection: { name: "STALE A", capabilities: [], background: {} },
                  }),
              });
          })
        : okJson({ name: "Fresh B", capabilities: [], background: {} })(),
    );
    const host = makeEl("div");
    h.FydCircle.mount(host, { objectId: "slow", apiBase: "https://a" });
    h.FydCircle.mount(host, { objectId: "fast", apiBase: "https://a" });
    await flush();
    resolveSlow?.();
    await flush();
    expect(host.firstChild?.getAttribute("aria-label")).toBe("Fresh B");
    h.restore();
  });

  test("remount race: a stale failure resolving last cannot overwrite the fresh render", async () => {
    let rejectSlow: ((e: Error) => void) | undefined;
    const h = loadLoader((url: string) =>
      url.includes("id=slow")
        ? new Promise((_, rej) => {
            rejectSlow = rej;
          })
        : okJson({ name: "Fresh B", capabilities: [], background: {} })(),
    );
    const host = makeEl("div");
    h.FydCircle.mount(host, { objectId: "slow", apiBase: "https://a" });
    h.FydCircle.mount(host, { objectId: "fast", apiBase: "https://a" });
    await flush();
    rejectSlow?.(new Error("late failure"));
    await flush();
    expect(host.firstChild?.getAttribute("aria-label")).toBe("Fresh B");
    h.restore();
  });

  test("a fresh fetch failure still fails closed", async () => {
    const h = loadLoader(() => Promise.reject(new Error("down")));
    const host = makeEl("div");
    h.FydCircle.mount(host, { objectId: "z", apiBase: "https://a" });
    await flush();
    expect(host.firstChild?.getAttribute("aria-label")).toBe("Circle unavailable");
    h.restore();
  });
});

/* ------------------------------------------------------------------ */
/* Finding 3: intent-gated player; lifecycle proof is in the browser.  */
/* ------------------------------------------------------------------ */
describe("player fixture (finding 3)", () => {
  test("episode page delegates to the intent-gated player and keeps the external watch link", () => {
    const src = read("src/app/episodes/[slug]/page.tsx");
    expect(src).toContain("<EpisodePlayer");
    expect(src).toContain("href={video.watchUrl}");
  });

  test("the real player renders a title plate and fallback before requesting any iframe", () => {
    const html = renderToStaticMarkup(
      createElement(EpisodePlayer, {
        title: "Fixture episode",
        embedUrl: "https://player.example/embed/fixture",
      }),
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("https://player.example/embed/fixture");
    expect(html).toContain("Fixture episode");
    expect(html).toContain("Load episode player");
    expect(html).toContain("Use Watch on YouTube below");
  });
});

/* ------------------------------------------------------------------ */
/* Finding 6: spatial arrow navigation and grid/list state parity.     */
/* ------------------------------------------------------------------ */
describe("spatial fixtures (finding 6)", () => {
  const node = (objectId: string, priority: number) => ({
    objectId,
    role: "service" as const,
    label: objectId,
    x: 0,
    y: 0,
    radius: 0.16,
    scale: 1,
    priority,
  });

  test("keyboardOrder sorts by priority, is deterministic, and does not mutate its input", () => {
    const spec: SpatialSpec = {
      focusedObjectId: "a",
      focusKind: "business",
      nodes: [node("c", 3), node("a", 1), node("b", 2)],
    };
    const before = spec.nodes.map((n) => n.objectId);
    const first = keyboardOrder(spec).map((n) => n.objectId);
    const second = keyboardOrder(spec).map((n) => n.objectId);
    expect(first).toEqual(["a", "b", "c"]);
    expect(second).toEqual(first);
    expect(spec.nodes.map((n) => n.objectId)).toEqual(before);
  });

  test("grid and reduced-motion list branches wire the same stage key handler", () => {
    const src = read("src/fyd/ui/spatial/spatial-canvas.tsx");
    const wirings = src.match(/onKeyDown=\{onStageKeyDown\}/g) ?? [];
    expect(wirings.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* Findings 1 and 2: code-property guards (browser proof is separate). */
/* ------------------------------------------------------------------ */
describe("focus code-property guards (findings 1 and 2)", () => {
  test("object circle dialog carries scroll padding for its sticky bar", () => {
    const src = read("src/fyd/ui/object-circle.tsx");
    expect(src).toMatch(/scroll-pt-\d+/);
  });

  test.each(["src/fyd/ui/follow-button.tsx", "src/fyd/ui/like-button.tsx"])(
    "%s keeps focus by never using the native disabled attribute",
    (rel) => {
      const src = read(rel);
      expect(src).toContain("aria-disabled");
      expect(src).not.toMatch(/(?<![-\w])disabled=\{/);
      expect(src).not.toMatch(/disabled:/);
    },
  );
});
