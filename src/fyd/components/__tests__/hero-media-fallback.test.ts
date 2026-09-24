/**
 * Hero media fallback tests: the generic renderer-level failure boundary.
 *
 * Architecture: renderer.tsx is imported by server-only routes (the FYD
 * customize API route) and must stay a server module, so the failure latch
 * lives in the small "use client" component hero-section.tsx (HeroSection).
 * The photographic block itself (HeroPhotoBlock) is pure: it renders the
 * photo block or nothing from (hero, failed) props, so node-based tests can
 * drive the failure transition directly by invoking the wired onError
 * handlers. HeroSection's initial renders are asserted through
 * renderToStaticMarkup (useState initial state), and the live error-path
 * transition is verified in a real browser against the served build.
 *
 * Simulates a 404 (the img error event) on the main hero image and on the
 * blur placeholder, and asserts the photo block degrades to the honest
 * typographic hero treatment with no broken <img> left in the markup. The
 * media is a synthetic DisplayMedia (no tenant-specific fixture), and the
 * Hero renders from the shared happy-place fixture graph through the real
 * renderSection path.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs hero-media-fallback
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { buildRenderContext, renderSection } from "../renderer";
import {
  effectiveHeroMedia,
  HeroPhotoBlock,
  HeroSection,
} from "../hero-section";
import type { DisplayMedia } from "../../media/select";
import type { FYDThemeTokens } from "../../sitespec/types";
import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";

const MEDIA: DisplayMedia = {
  id: "media-hero-test-1",
  role: "hero",
  src: "https://fyd.invalid/media/hero.jpg",
  blurUrl: "https://fyd.invalid/media/hero-blur.jpg",
  width: 1600,
  height: 900,
  alt: "Test storefront photo",
  rightsSource: "public-demo-source",
  rightsBasis: "test-fixture",
  sourceUrl: "https://example.invalid/photo.jpg",
  digest: "deadbeef",
  observedAt: "2026-09-24",
};

// Minimal theme tokens for the client boundary (only ink/accent affect it).
const THEME = { ink: "#14101f", accent: "#c9a227" } as FYDThemeTokens;

/** Collect the <img> elements out of a directly-invoked function component tree. */
function imgElements(tree: ReactElement | null): ReactElement[] {
  if (!tree) return [];
  const kids = tree.props.children as unknown;
  const flat: unknown[] = Array.isArray(kids) ? kids : [kids];
  return flat.filter(
    (k): k is ReactElement =>
      !!k && typeof k === "object" && (k as ReactElement).type === "img",
  );
}

function heroSectionAndCtx(heroMedia: DisplayMedia | null) {
  const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, {
    generatedAt: "2026-09-21T12:00:00.000Z",
    eventSequences: [65, 83],
  });
  const page = spec.pages.find((p) =>
    p.sections.some((s) => s.component === "Hero"),
  );
  if (!page) throw new Error("fixture spec has no Hero section");
  const section = page.sections.find((s) => s.component === "Hero");
  if (!section) throw new Error("fixture spec has no Hero section");
  const ctx = {
    ...buildRenderContext(spec, HAPPY_PLACE_RICH_GRAPH, {
      viewerId: null,
      displayName: null,
    }),
    heroMedia,
  };
  return { section, ctx };
}

describe("hero media fallback", () => {
  test("photo block renders the main image and blur placeholder, both wired to the failure handler", () => {
    let failures = 0;
    const onMediaError = () => {
      failures += 1;
    };
    const tree = HeroPhotoBlock({ hero: MEDIA, failed: false, onMediaError });
    const imgs = imgElements(tree);
    expect(imgs).toHaveLength(2);
    const srcs = imgs.map((i) => i.props.src as string);
    expect(srcs).toContain(MEDIA.src);
    expect(srcs).toContain(MEDIA.blurUrl);
    for (const img of imgs) {
      expect(img.props.onError).toBe(onMediaError);
    }
    expect(failures).toBe(0);
    const html = renderToStaticMarkup(
      HeroPhotoBlock({ hero: MEDIA, failed: false, onMediaError }),
    );
    expect(html).toContain('data-hero-media="media-hero-test-1"');
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  test("a 404 on the main image degrades the block: no photo block, no broken img", () => {
    let failures = 0;
    const onMediaError = () => {
      failures += 1;
    };
    const tree = HeroPhotoBlock({ hero: MEDIA, failed: false, onMediaError });
    const main = imgElements(tree).find((i) => i.props.src === MEDIA.src);
    expect(main).toBeDefined();
    // Simulate the browser error event for a 404 on the main image.
    main!.props.onError();
    expect(failures).toBe(1);
    // Failed state renders nothing: the Hero falls back to typographic.
    const html = renderToStaticMarkup(
      HeroPhotoBlock({ hero: MEDIA, failed: true, onMediaError }),
    );
    expect(html).toBe("");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-hero-media");
  });

  test("a 404 on the blur placeholder also degrades the whole block", () => {
    let failures = 0;
    const onMediaError = () => {
      failures += 1;
    };
    const tree = HeroPhotoBlock({ hero: MEDIA, failed: false, onMediaError });
    const blur = imgElements(tree).find((i) => i.props.src === MEDIA.blurUrl);
    expect(blur).toBeDefined();
    // Simulate the browser error event for a 404 on the blur placeholder.
    blur!.props.onError();
    expect(failures).toBe(1);
    const html = renderToStaticMarkup(
      HeroPhotoBlock({ hero: MEDIA, failed: true, onMediaError }),
    );
    expect(html).toBe("");
  });

  test("photo block without a blur placeholder wires the single image", () => {
    const noBlur: DisplayMedia = { ...MEDIA, blurUrl: null };
    const tree = HeroPhotoBlock({
      hero: noBlur,
      failed: false,
      onMediaError: () => {},
    });
    const imgs = imgElements(tree);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].props.src).toBe(MEDIA.src);
    expect(typeof imgs[0].props.onError).toBe("function");
  });

  test("effectiveHeroMedia: present media passes through, missing media selects nothing", () => {
    expect(effectiveHeroMedia(MEDIA)).toBe(MEDIA);
    expect(effectiveHeroMedia(null)).toBeNull();
    expect(effectiveHeroMedia(undefined)).toBeNull();
  });

  test("HeroSection initial render shows the photo treatment with server children", () => {
    const html = renderToStaticMarkup(
      createElement(
        HeroSection,
        { hero: MEDIA, theme: THEME, character: "EDITORIAL" },
        createElement("h1", null, "Test heading"),
      ),
    );
    expect(html).toContain('data-hero-treatment="photo"');
    expect(html).toContain('data-hero-media="media-hero-test-1"');
    expect(html).toContain('data-layout-character="EDITORIAL"');
    expect(html).toContain("<h1>Test heading</h1>");
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  test("HeroSection with null hero renders the typographic treatment with no images", () => {
    const html = renderToStaticMarkup(
      createElement(
        HeroSection,
        { hero: null, theme: THEME, character: "EDITORIAL" },
        createElement("h1", null, "Test heading"),
      ),
    );
    expect(html).toContain('data-hero-treatment="typographic"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-hero-media");
    // The designed no-media wash, not a flat empty panel.
    expect(html).toContain("linear-gradient");
    // Server-rendered children are untouched by the fallback.
    expect(html).toContain("<h1>Test heading</h1>");
  });

  test("Hero with media renders the photo treatment", () => {
    const { section, ctx } = heroSectionAndCtx(MEDIA);
    const html = renderToStaticMarkup(renderSection(section, ctx));
    expect(html).toContain('data-hero-treatment="photo"');
    expect(html).toContain('data-hero-media="media-hero-test-1"');
    expect(html).toContain("<img");
  });

  test("Hero with null media renders the typographic treatment with no images", () => {
    const { section, ctx } = heroSectionAndCtx(null);
    const html = renderToStaticMarkup(renderSection(section, ctx));
    expect(html).toContain('data-hero-treatment="typographic"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-hero-media");
    // The honest typographic hero still names the business.
    expect(html).toContain("Happy Place");
  });
});
