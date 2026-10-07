/**
 * Item 9 (fyd-execution) regression: INV-RM-1 honest responsive images.
 *
 * The render seam builds srcset ONLY from variants that exist in the
 * site's media manifest. A fixture DisplayMedia with variants [480w,
 * 768w] must produce a srcset containing exactly those widths, a sizes
 * value, intrinsic width/height of the chosen variant, lazy/eager per
 * placement, and NO srcset width above the honest source width.
 */

import {
  responsiveImgProps,
  honestSourceWidth,
  type HonestVariant,
} from "../responsive";
import type { DisplayMedia } from "../select";

function fixtureMedia(over: Partial<DisplayMedia> = {}): DisplayMedia {
  const variants: HonestVariant[] = [
    { name: "thumbnail", width: 480, height: 270, url: "/fyd-media/abc/thumbnail-480w.webp" },
    { name: "card", width: 768, height: 432, url: "/fyd-media/abc/card-768w.webp" },
  ];
  return {
    id: "fyd-media-abc",
    role: "hero",
    src: "/fyd-media/abc/card-768w.webp",
    blurUrl: "/fyd-media/abc/blur-10w.webp",
    width: 768,
    height: 432,
    alt: "Fixture hero",
    rightsSource: "public-demo-source",
    rightsBasis: "Demo basis.",
    sourceUrl: "https://example.com/photo",
    digest: "abc123",
    observedAt: "2026-10-07",
    variants,
    ...over,
  };
}

const SIZES = "(max-width: 640px) 100vw, (max-width: 1360px) 48vw, 585px";

test("srcset contains exactly the manifest variant widths", () => {
  const props = responsiveImgProps(fixtureMedia(), { sizes: SIZES, eager: true });
  expect(props.srcSet).toBe(
    "/fyd-media/abc/thumbnail-480w.webp 480w, /fyd-media/abc/card-768w.webp 768w",
  );
});

test("sizes, intrinsic dimensions, and loading are honest", () => {
  const props = responsiveImgProps(fixtureMedia(), { sizes: SIZES, eager: true });
  expect(props.sizes).toBe(SIZES);
  expect(props.width).toBe(768);
  expect(props.height).toBe(432);
  expect(props.loading).toBe("eager");
  expect(props.decoding).toBe("async");
  expect(props.fetchPriority).toBeUndefined(); // unmeasured -> no priority
});

test("below the fold is lazy with no priority, even when measured", () => {
  const props = responsiveImgProps(fixtureMedia(), {
    sizes: SIZES,
    priorityMeasured: true,
  });
  expect(props.loading).toBe("lazy");
  expect(props.fetchPriority).toBeUndefined();
});

test("measured priority is honored only above the fold", () => {
  const props = responsiveImgProps(fixtureMedia(), {
    sizes: SIZES,
    eager: true,
    priorityMeasured: true,
  });
  expect(props.fetchPriority).toBe("high");
});

test("no srcset width exceeds the honest source width", () => {
  // The seam's provable source width is the widest manifest variant (the
  // mint-time never-upscale rule, pinned by media-no-upscale.test.ts,
  // guarantees no manifest variant exceeds the true source). The seam
  // must never EMIT above that cap.
  const media = fixtureMedia();
  const props = responsiveImgProps(media, { sizes: SIZES, eager: true });
  const widths = propsSrcSetWidths(props);
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths)).toBeLessThanOrEqual(honestSourceWidth(media));
  expect(honestSourceWidth(media)).toBe(768);
});

test("blur placeholders never join the srcset", () => {
  const media = fixtureMedia({
    variants: [
      { name: "thumbnail", width: 480, height: 270, url: "/fyd-media/abc/thumbnail-480w.webp" },
      { name: "blur", width: 10, height: 6, url: "/fyd-media/abc/blur-10w.webp" },
    ],
  });
  const props = responsiveImgProps(media, { sizes: SIZES, eager: true });
  expect(props.srcSet).not.toContain("blur");
  expect(props.srcSet).not.toContain("10w");
});

function propsSrcSetWidths(props: { srcSet: string }): number[] {
  return props.srcSet
    .split(",")
    .map((s) => parseInt(s.trim().split(" ").pop()!.replace("w", ""), 10));
}
