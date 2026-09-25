/**
 * TRACK B (2026-09-25, FYD product authority directive, Nolan): consequence
 * tiers in the product language (LOW / MEDIUM / HIGH).
 *
 * - LOW: reorder, generated headline, spacing, owner-approved image.
 *   Apply plus undo.
 * - MEDIUM: public factual presentation, hide/show address, CTA.
 *   Explicit confirmation required.
 * - HIGH: external publish, communication, spend, provider relationship,
 *   mass action. Explicit capability PLUS approval. Demo mode cannot
 *   authorize these (see ../../owner-mode/__tests__).
 *
 * The four-tier owner-command scale folds HIGH+CRITICAL into HIGH: both
 * demand explicit capability plus approval.
 */

import {
  foldLegacyTier,
  HIGH_CLASS_CATEGORIES,
  LOW_CLASS_DESCRIPTION,
  MEDIUM_CLASS_DESCRIPTION,
} from "../consequence-tiers";
import { commandConsequenceTier } from "../commands";
import type { OwnerCommand } from "../types";

describe("product consequence tiers", () => {
  test("foldLegacyTier folds HIGH and CRITICAL into HIGH", () => {
    expect(foldLegacyTier("LOW")).toBe("LOW");
    expect(foldLegacyTier("MEDIUM")).toBe("MEDIUM");
    expect(foldLegacyTier("HIGH")).toBe("HIGH");
    expect(foldLegacyTier("CRITICAL")).toBe("HIGH");
  });

  test("the HIGH class names the directive's five consequential categories", () => {
    expect([...HIGH_CLASS_CATEGORIES]).toEqual([
      "external publish",
      "communication",
      "spend",
      "provider relationship",
      "mass action",
    ]);
  });

  test("LOW/MEDIUM descriptions name the directive's classes", () => {
    expect(LOW_CLASS_DESCRIPTION).toMatch(/Apply plus undo/);
    expect(MEDIUM_CLASS_DESCRIPTION).toMatch(/Explicit confirmation/);
    expect(MEDIUM_CLASS_DESCRIPTION).toMatch(/hide\/show address/);
  });

  test("no owner command is ever classified HIGH: HIGH lives in the capability seam", () => {
    const everyCommand: OwnerCommand[] = [
      { type: "move-service", id: "a", to: "first" },
      { type: "set-service-visibility", id: "a", visible: false },
      { type: "add-service", name: "X" },
      { type: "set-address-visibility", visibility: "hide" },
      { type: "set-address-visibility", visibility: "show" },
      { type: "set-address-visibility", visibility: "default" },
      { type: "set-contact-field", field: "phone", value: "x" },
      { type: "revert-contact-field", field: "phone" },
      { type: "confirm-contact-field", field: "phone" },
    ];
    for (const cmd of everyCommand) {
      const tier = commandConsequenceTier(cmd);
      expect(["LOW", "MEDIUM"]).toContain(tier);
      // And the product fold keeps them LOW/MEDIUM (never HIGH).
      expect(["LOW", "MEDIUM"]).toContain(foldLegacyTier(tier));
    }
  });
});
