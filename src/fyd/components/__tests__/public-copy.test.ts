/**
 * Public-copy purity authority tests (polish lane, 2026-09-26).
 *
 * The handle-fragment rule targets person identities (the observed
 * "coppersmithplm" case is ping.social.person@1); a lowercase one-word
 * BUSINESS brand must survive. Provenance narration is never public copy
 * for any schema.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs public-copy
 */

import {
  hasUsablePublicCopy,
  isHandleFragmentTitle,
  isProvenanceNarration,
  isUsablePublicTitle,
} from "../../sitespec/public-copy";

describe("public-copy purity authority", () => {
  test("person handle fragment is not usable public copy", () => {
    expect(
      isHandleFragmentTitle("coppersmithplm", "ping.social.person@1"),
    ).toBe(true);
    expect(
      isUsablePublicTitle("coppersmithplm", "ping.social.person@1"),
    ).toBe(false);
    expect(
      hasUsablePublicCopy({
        title: "coppersmithplm",
        description: "Person described in the website's structured data.",
        schema: "ping.social.person@1",
      }),
    ).toBe(false);
  });

  test("lowercase one-word business brand is usable public copy", () => {
    expect(
      isHandleFragmentTitle("grandjunction", "ping.social.business@1"),
    ).toBe(false);
    expect(
      isUsablePublicTitle("grandjunction", "ping.social.business@1"),
    ).toBe(true);
    expect(
      hasUsablePublicCopy({
        title: "grandjunction",
        schema: "ping.social.business@1",
      }),
    ).toBe(true);
  });

  test("absent schema fails closed: handle still filtered", () => {
    expect(isHandleFragmentTitle("coppersmithplm")).toBe(true);
    expect(isUsablePublicTitle("coppersmithplm")).toBe(false);
  });

  test("provenance narration is never public copy, any schema", () => {
    const narration = "Person described in the website's structured data.";
    expect(isProvenanceNarration(narration)).toBe(true);
    expect(isUsablePublicTitle(narration, "ping.social.person@1")).toBe(false);
    expect(isUsablePublicTitle(narration, "ping.social.business@1")).toBe(false);
    expect(
      isUsablePublicTitle(
        "Coarse public location claim from the website's structured data.",
        "ping.social.business@1",
      ),
    ).toBe(false);
  });

  test("real names and business titles are usable", () => {
    expect(isUsablePublicTitle("Nolan Geske", "ping.social.person@1")).toBe(
      true,
    );
    expect(
      isUsablePublicTitle("Coppersmith Plumbing", "ping.social.business@1"),
    ).toBe(true);
    expect(isUsablePublicTitle("")).toBe(false);
  });
});
