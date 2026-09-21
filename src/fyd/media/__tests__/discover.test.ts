/**
 * Tests for image discovery (node-html-parser implementation).
 * Contract: same output shapes as the implementation this replaced.
 */

import { classifyRights, discoverImages } from "../discover";

const PAGE = "https://www.example.com/services/";

describe("discoverImages", () => {
  test("extracts img src and alt, resolving relative URLs", () => {
    const found = discoverImages(
      '<html><body><img src="/images/hero.jpg" alt="Our crew"></body></html>',
      PAGE,
    );
    expect(found).toEqual([
      { url: "https://www.example.com/images/hero.jpg", alt: "Our crew", kind: "img" },
    ]);
  });

  test("falls back through lazy-load attributes and skips data: URLs", () => {
    const found = discoverImages(
      '<img data-src="/lazy.jpg" alt="lazy"><img src="data:image/gif;base64,AAA" alt="inline">',
      PAGE,
    );
    expect(found).toEqual([
      { url: "https://www.example.com/lazy.jpg", alt: "lazy", kind: "img" },
    ]);
  });

  test("picks the largest srcset candidate", () => {
    const found = discoverImages(
      '<img src="/s.jpg" srcset="/s-320.jpg 320w, /s-1280.jpg 1280w" alt="s">',
      PAGE,
    );
    const kinds = found.map((f) => f.kind);
    expect(kinds).toContain("img");
    expect(kinds).toContain("srcset");
    expect(found.find((f) => f.kind === "srcset")?.url).toBe("https://www.example.com/s-1280.jpg");
  });

  test("extracts og:image, link image_src, and JSON-LD images", () => {
    const html = [
      '<meta property="og:image" content="https://cdn.example.com/og.jpg">',
      '<link rel="image_src" href="/link.jpg">',
      '<script type="application/ld+json">',
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        image: ["https://www.example.com/a.jpg", { url: "https://www.example.com/b.jpg" }],
      }),
      "</script>",
    ].join("\n");
    const found = discoverImages(html, PAGE);
    const byKind = new Map(found.map((f) => [f.kind + ":" + f.url, f]));
    expect(byKind.has("og:image:https://cdn.example.com/og.jpg")).toBe(true);
    expect(byKind.has("link-image:https://www.example.com/link.jpg")).toBe(true);
    expect(byKind.has("jsonld:https://www.example.com/a.jpg")).toBe(true);
    expect(byKind.has("jsonld:https://www.example.com/b.jpg")).toBe(true);
  });

  test("dedupes repeated URLs and drops non-http(s)", () => {
    const found = discoverImages(
      '<img src="/dup.jpg"><img src="/dup.jpg"><img src="ftp://x.example.com/f.jpg">',
      PAGE,
    );
    expect(found).toEqual([
      { url: "https://www.example.com/dup.jpg", alt: null, kind: "img" },
    ]);
  });

  test("handles uppercase tags and attributes", () => {
    const found = discoverImages('<IMG SRC="/up.jpg" ALT="Up">', PAGE);
    expect(found).toEqual([
      { url: "https://www.example.com/up.jpg", alt: "Up", kind: "img" },
    ]);
  });

  test("falls back to regex scan for malformed JSON-LD", () => {
    const found = discoverImages(
      '<script type="application/ld+json">{not valid json, "image": "https://www.example.com/m.jpg"}</script>',
      PAGE,
    );
    expect(found.some((f) => f.url === "https://www.example.com/m.jpg" && f.kind === "jsonld")).toBe(true);
  });
});

describe("classifyRights", () => {
  const ORIGIN = "https://www.coppersmithplumbing.com";
  test("same-origin marketing image is a public demo source", () => {
    const r = classifyRights(ORIGIN + "/wp-content/uploads/2023/05/hvac-heat.jpg", "coppersmith", ORIGIN);
    expect(r.rightsSource).toBe("public-demo-source");
    expect(r.basis).toContain("FYD claims no copyright");
  });
  test("off-origin image is reference-only", () => {
    const r = classifyRights("https://cdn.other.com/x.jpg", "coppersmith", ORIGIN);
    expect(r.rightsSource).toBe("unclear-reference-only");
  });
  test("logo-like image not matching the business is reference-only", () => {
    const r = classifyRights(ORIGIN + "/wp-content/uploads/carrier-logo.png", "coppersmith", ORIGIN);
    expect(r.rightsSource).toBe("unclear-reference-only");
  });
  test("unparseable URL is reference-only, never acquirable", () => {
    const r = classifyRights("not a url", "coppersmith", ORIGIN);
    expect(r.rightsSource).toBe("unclear-reference-only");
  });
  test("logo matching the business name stays acquirable", () => {
    const r = classifyRights(ORIGIN + "/wp-content/uploads/coppersmith-logo.png", "coppersmith", ORIGIN);
    expect(r.rightsSource).toBe("public-demo-source");
  });
});
