/**
 * Tests for the FYD circle projection layer.
 *
 * - coppersmith-plumbing resolves an image background: it has authorized
 *   site media, so the circle uses the smallest (blur) derivative.
 * - happy-place resolves a deterministic gradient: its only manifest asset
 *   is external_reference, so no site media qualifies.
 * - The projection never emits "view"; "follow" and "ask" are always there.
 * - Unknown ids return null.
 * Run from the repo root so manifests resolve via process.cwd().
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCircleBackground } from "../../media/circle-background";
import { buildCircleProjection, loadCircleProjection } from "../view";
import { getVerifiedPublicProjectionSync } from "../../data/ping-object-source";
/** Anonymous verified projection for a fixture slug (null when unknown). */
const proj = (slug: string) => getVerifiedPublicProjectionSync(slug, "anonymous");
const projOrNull = (slug: string) => {
  try {
    return proj(slug);
  } catch {
    return null;
  }
};

beforeEach(() => {
  // Isolate owner state so tests never touch real demo data, and point the
  // PING-backed source at the test projections.
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-circle-test-"));
  process.env.FYD_PROJECTION_DIR = join(__dirname, "fixtures", "projections");
});

function manifestBytesForSrc(objectId: string, src: string): number {
  const manifest = JSON.parse(
    readFileSync(
      join(process.cwd(), "src", "fyd", "media", "manifests", objectId + ".json"),
      "utf8",
    ),
  ) as { media?: { variants?: { url: string; bytes: number }[] }[] };
  for (const m of manifest.media ?? []) {
    for (const v of m.variants ?? []) {
      if (v.url === src) return v.bytes;
    }
  }
  throw new Error("src not found in manifest: " + src);
}

describe("resolveCircleBackground", () => {
  test("coppersmith resolves an image background from a tiny derivative", () => {
    const bg = resolveCircleBackground("coppersmith-plumbing");
    expect(bg.kind).toBe("image");
    if (bg.kind !== "image") return;
    expect(bg.src.startsWith("/fyd-media/")).toBe(true);
    // The src is the blur (tiny optimized) derivative: a few hundred bytes.
    expect(manifestBytesForSrc("coppersmith-plumbing", bg.src)).toBeLessThan(1000);
    expect(bg.basis).toBe("Website photo, tiny optimized derivative");
    expect(bg.digest).not.toBe("");
    expect(bg.observedAt).not.toBe("");
  });

  test("happy-place resolves a deterministic gradient", () => {
    const first = resolveCircleBackground("happy-place");
    const second = resolveCircleBackground("happy-place");
    expect(first).toEqual(second);
    expect(first.kind).toBe("gradient");
    if (first.kind !== "gradient") return;
    expect(first.css).toMatch(
      /^radial-gradient\(circle at 35% 30%, hsl\(\d+ 45% 62%\), hsl\(\d+ 50% 38%\)\)$/,
    );
    // Warm artisan palette: leading hue 18..42.
    const hue = Number(/hsl\((\d+)/.exec(first.css)![1]);
    expect(hue).toBeGreaterThanOrEqual(18);
    expect(hue).toBeLessThanOrEqual(42);
    expect(first.basis).toBe("Deterministic fallback, no authorized site media");
    expect(first.observedAt).not.toBe("");
  });

  test("the two objects look visually distinct", () => {
    const copper = resolveCircleBackground("coppersmith-plumbing");
    const happy = resolveCircleBackground("happy-place");
    expect(copper.kind).not.toBe(happy.kind);
  });
});

describe("loadCircleProjection", () => {
  test("returns null for unknown objects", () => {
    expect(loadCircleProjection(projOrNull("nope"), "nope")).toBeNull();
  });

  test("coppersmith circle: no view capability, follow and ask always present", () => {
    const circle = loadCircleProjection(proj("coppersmith-plumbing"), "coppersmith-plumbing");
    expect(circle).not.toBeNull();
    const kinds = circle!.capabilities.map((c) => c.kind);
    expect(kinds).not.toContain("view");
    expect(kinds).toContain("follow");
    expect(kinds).toContain("ask");
    expect(circle!.background.kind).toBe("image");
    // Tagline is the summary's first 90 chars, trimmed at a word boundary.
    expect(circle!.tagline.length).toBeLessThanOrEqual(90);
    expect(circle!.topFacts.length).toBeLessThanOrEqual(3);
    expect(circle!.sampleQuestions).toHaveLength(3);
    expect(circle!.provenanceLabel).not.toBe("");
    expect(circle!.provenanceDetail).not.toBe("");
  });

  test("happy-place circle: gradient background, word-boundary tagline", () => {
    const circle = loadCircleProjection(proj("happy-place"), "happy-place");
    expect(circle).not.toBeNull();
    expect(circle!.background.kind).toBe("gradient");
    expect(circle!.tagline.length).toBeLessThanOrEqual(90);
    expect(circle!.topFacts.length).toBeLessThanOrEqual(3);
    // Happy Place's only structured service (PING journal overlay) is the fact.
    expect(circle!.topFacts).toEqual(["Pergola Design Consultations"]);
    const kinds = circle!.capabilities.map((c) => c.kind);
    expect(kinds).toContain("follow");
  });

  test("legacy buildCircleProjection alias still resolves", () => {
    expect(buildCircleProjection(proj("happy-place"), "happy-place")?.topFacts).toEqual([
      "Pergola Design Consultations",
    ]);
  });
});
