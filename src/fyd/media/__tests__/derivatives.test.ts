/**
 * Tests for derivative generation (fyd-media@2).
 *
 * Contract: every generated variant carries derivedFrom = the sha256 of
 * the ORIGINAL bytes it was produced from (the derived-asset
 * relationship, explicit in data). Runs sharp for real against a tiny
 * generated PNG; no network, temp dir only.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { generateDerivatives, hashContentBytes, planDerivatives } from "../derivatives";

describe("planDerivatives", () => {
  test("generates only the product's named sizes, never upscales", () => {
    const plans = planDerivatives(2000);
    expect(plans.map((p) => p.name)).toEqual(["thumbnail", "card", "hero", "blur"]);
    expect(plans.map((p) => p.width)).toEqual([480, 768, 1600, 10]);
    // No speculative responsive ladder: 1080/2000 are not generated.
    expect(plans.some((p) => p.width === 1080 || p.width === 2000)).toBe(false);
    expect(plans.every((p) => p.format === "webp")).toBe(true);
  });

  test("small sources get one rendition at source width (no upscale)", () => {
    const plans = planDerivatives(100);
    expect(plans.map((p) => p.name)).toEqual(["thumbnail", "blur"]);
    expect(plans[0].width).toBe(100);
    expect(plans[1].width).toBe(10);
  });

  test("deterministic: same width, same plan", () => {
    expect(planDerivatives(1600)).toEqual(planDerivatives(1600));
  });
});

describe("generateDerivatives", () => {
  test("every variant stamps derivedFrom with the original digest", async () => {
    const input = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 180, g: 100, b: 40 } },
    })
      .png()
      .toBuffer();
    const digest = hashContentBytes(input);
    const dir = mkdtempSync(join(tmpdir(), "fyd-media-test-"));
    try {
      const gen = await generateDerivatives(input, digest, dir);
      expect(gen.variants.length).toBeGreaterThan(0);
      for (const v of gen.variants) {
        expect(v.derivedFrom).toBe(digest);
        expect(v.digest).toHaveLength(64);
        expect(v.url).toBe("/fyd-media/" + digest + "/" + v.name + "-" + v.width + "w.webp");
      }
      // Dimensions are observed from the bytes, never invented.
      expect(gen.width).toBe(64);
      expect(gen.height).toBe(48);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects non-image bytes (validates actual bytes, not extension)", async () => {
    const notImage = Buffer.from("this is not an image, whatever the filename says", "utf8");
    const digest = hashContentBytes(notImage);
    const dir = mkdtempSync(join(tmpdir(), "fyd-media-test-"));
    try {
      await expect(generateDerivatives(notImage, digest, dir)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects absurd source dimensions (decompression-bomb guard)", async () => {
    // 8100px on one axis exceeds the bound; solid color keeps it fast.
    const huge = await sharp({
      create: { width: 8100, height: 16, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const digest = hashContentBytes(huge);
    const dir = mkdtempSync(join(tmpdir(), "fyd-media-test-"));
    try {
      await expect(generateDerivatives(huge, digest, dir)).rejects.toThrow(/exceed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
