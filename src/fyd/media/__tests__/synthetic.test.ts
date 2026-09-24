/**
 * Synthetic / demo media marking (lane-media).
 *
 * No fabricated photo is ever presented as real: synthetic assets carry
 * their mark into the render caption, and minting without a caption
 * throws.
 */

import {
  isMarkedSynthetic,
  kindSentence,
  markPhotograph,
  markSynthetic,
  renderCaption,
  type SyntheticKind,
} from "../synthetic";

const DIGEST = "a".repeat(64);
const TS = "2026-09-23T00:00:00.000Z";

describe("synthetic marking", () => {
  test("a real photograph renders its photo basis unchanged", () => {
    const m = markPhotograph(DIGEST);
    expect(isMarkedSynthetic(m)).toBe(false);
    expect(renderCaption(m, "Public marketing imagery on the business site.")).toBe(
      "Public marketing imagery on the business site.",
    );
  });

  test("an AI-generated asset is disclosed, never presented as a photo", () => {
    const m = markSynthetic(DIGEST, {
      kind: "ai-generated",
      generator: "test-generator",
      createdAt: TS,
      caption: "Mascot artwork for the demo hero.",
    });
    expect(isMarkedSynthetic(m)).toBe(true);
    const caption = renderCaption(m, "Public marketing imagery on the business site.");
    expect(caption).toContain("Not a photograph of this business");
    expect(caption).toContain("Mascot artwork for the demo hero.");
    // The photo basis is NOT reused for synthetic assets.
    expect(caption).not.toContain("Public marketing imagery");
  });

  test("every synthetic kind carries its own disclosure sentence", () => {
    const kinds: SyntheticKind[] = ["ai-generated", "placeholder", "demo-mock"];
    for (const kind of kinds) {
      const m = markSynthetic(DIGEST, {
        kind,
        generator: "test-generator",
        createdAt: TS,
        caption: "Demo caption.",
      });
      const caption = renderCaption(m, "photo basis");
      expect(caption).toBe(kindSentence(kind) + " Demo caption.");
      expect(caption).toContain("Not a photograph of this business");
    }
  });

  test("empty caption at mint time throws", () => {
    expect(() =>
      markSynthetic(DIGEST, {
        kind: "placeholder",
        generator: "test-generator",
        createdAt: TS,
        caption: "   ",
      }),
    ).toThrow(/caption/);
  });

  test("missing generator throws", () => {
    expect(() =>
      markSynthetic(DIGEST, {
        kind: "placeholder",
        generator: "",
        createdAt: TS,
        caption: "Has a caption.",
      }),
    ).toThrow(/generator/);
  });

  test("malformed digest throws", () => {
    expect(() =>
      markSynthetic("not-a-sha256", {
        kind: "placeholder",
        generator: "test-generator",
        createdAt: TS,
        caption: "Has a caption.",
      }),
    ).toThrow(/digest/);
    expect(() => markPhotograph("zzz")).toThrow(/digest/);
  });

  test("the mark round-trips: generator, time, recipe, trimmed caption", () => {
    const m = markSynthetic(DIGEST, {
      kind: "demo-mock",
      generator: "  test-generator  ",
      createdAt: TS,
      caption: "  Demo caption with padding.  ",
      recipe: "seed=42",
    });
    expect(m.digest).toBe(DIGEST);
    expect(m.synthetic!.generator).toBe("test-generator");
    expect(m.synthetic!.createdAt).toBe(TS);
    expect(m.synthetic!.caption).toBe("Demo caption with padding.");
    expect(m.synthetic!.recipe).toBe("seed=42");
  });
});
