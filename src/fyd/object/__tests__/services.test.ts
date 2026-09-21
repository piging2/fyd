/**
 * Tests for deterministic service derivation.
 *
 * Evidence class under test: DERIVED DETERMINISTIC. Same description must
 * always produce the same service list; no structured Service objects are
 * invented.
 */

import { deriveServicesFromDescription, slugifyService } from "../services";

describe("deriveServicesFromDescription", () => {
  test("parses the Happy Place description into its service list", () => {
    const names = deriveServicesFromDescription(
      "Licensed Oregon carpentry contractor (CCB# 254240) building decks, fences, pergolas, bathrooms, and custom work across Benton, Linn, Marion & Polk Counties.",
    );
    expect(names).toEqual(["Decks", "Fences", "Pergolas", "Bathrooms", "Custom Work"]);
  });

  test("returns empty when no service verb is present", () => {
    expect(deriveServicesFromDescription("A fine business.")).toEqual([]);
    expect(deriveServicesFromDescription("")).toEqual([]);
  });

  test("is deterministic and deduplicated", () => {
    const d = "We are building decks, fences, and decks across town.";
    expect(deriveServicesFromDescription(d)).toEqual(deriveServicesFromDescription(d));
    expect(deriveServicesFromDescription(d)).toEqual(["Decks", "Fences"]);
  });

  test("handles an Oxford comma and a plain and-list", () => {
    expect(deriveServicesFromDescription("offering plumbing, heating, and cooling for homes")).toEqual([
      "Plumbing",
      "Heating",
      "Cooling",
    ]);
  });
});

describe("slugifyService", () => {
  test("produces stable content-derived ids", () => {
    expect(slugifyService("Custom Work")).toBe("svc-custom-work");
    expect(slugifyService("Decks")).toBe("svc-decks");
  });
});
