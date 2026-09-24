/**
 * Tests for the generated treatment (generated-treatment.ts).
 *
 * Pins the no-media contract: empty media yields a generated treatment
 * from deterministic tokens, never a broken image. The treatment
 * carries no URL, no src, no img, and no remote reference of any kind,
 * so it is structurally incapable of rendering as a broken image; the
 * caption always discloses that it is not a photograph.
 */

import {
  GENERATED_TREATMENT_BASIS,
  generatedTreatmentFor,
} from "../generated-treatment";

describe("generatedTreatmentFor", () => {
  test("deterministic: same input, byte-identical treatment", () => {
    const a = generatedTreatmentFor({
      objectId: "biz-1",
      title: "Coppersmith Plumbing",
    });
    const b = generatedTreatmentFor({
      objectId: "biz-1",
      title: "Coppersmith Plumbing",
    });
    expect(a).toEqual(b);
  });

  test("different objects get different treatments", () => {
    const a = generatedTreatmentFor({
      objectId: "biz-1",
      title: "Coppersmith Plumbing",
    });
    const b = generatedTreatmentFor({ objectId: "biz-2", title: "Happy Place" });
    expect(a.css).not.toBe(b.css);
    expect(a.tokens.digest).not.toBe(b.tokens.digest);
  });

  test("never a broken image: no URL, src, or img field anywhere", () => {
    const t = generatedTreatmentFor({
      objectId: "biz-1",
      title: "Coppersmith Plumbing",
    });
    expect("src" in t).toBe(false);
    expect("url" in t).toBe(false);
    expect("img" in t).toBe(false);
    const keys: string[] = [];
    JSON.stringify(t, (k, v) => {
      keys.push(k);
      return v;
    });
    expect(keys.some((k) => /url|src|href|img/i.test(k))).toBe(false);
    expect(JSON.stringify(t)).not.toMatch(/https?:\/\//);
  });

  test("initial comes from the title", () => {
    expect(
      generatedTreatmentFor({ objectId: "biz-1", title: "coppersmith" }).initial,
    ).toBe("C");
  });

  test("caption and basis carry the not-a-photograph disclosure", () => {
    const t = generatedTreatmentFor({ objectId: "biz-1", title: "X" });
    expect(t.caption).toMatch(/not a photograph/i);
    expect(t.basis).toBe(GENERATED_TREATMENT_BASIS);
    expect(t.basis).toMatch(/not a photograph/i);
  });

  test("kind tag is stable", () => {
    expect(
      generatedTreatmentFor({ objectId: "x", title: "Y" }).kind,
    ).toBe("generated-treatment");
  });
});
