/**
 * ClaimBadge honesty (2026-09-22): the badge names the actual claim
 * source. Website-derived content says "Website statement"; canonical
 * journal content says "Site record"; overlay-authored (demo) content
 * says "Demo addition"; mixed sections say "Mixed sources". The old
 * hardcoded "Website statement" for everything is gone.
 *
 * Run with: npx jest --config src/fyd/components/jest.config.cjs claim-badge
 */

import { claimBadgeLabel } from "../renderer";
import type { PingObject } from "@/lib/ping/types";

function obj(
  kind: "website-derived" | "canonical-journal" | "overlay-authored",
  claimKind?: string,
): PingObject {
  return {
    id: `obj-${kind}`,
    schema: "ping.social.service@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Test Service",
    description: "Test.",
    fields: claimKind ? { claimKind } : {},
    provenance: {
      kind,
      ref:
        kind === "website-derived"
          ? "website-ingestion:https://demo.test/"
          : "ping-event:demo-1",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

describe("claimBadgeLabel", () => {
  test("website-derived with website_statement claimKind", () => {
    expect(claimBadgeLabel([obj("website-derived", "website_statement")])).toBe(
      "Website statement",
    );
  });

  test("canonical journal is a site record, not a website statement", () => {
    expect(claimBadgeLabel([obj("canonical-journal")])).toBe("Site record");
  });

  test("overlay-authored is a demo addition", () => {
    expect(claimBadgeLabel([obj("overlay-authored")])).toBe("Demo addition");
  });

  test("feed items keep their label", () => {
    expect(claimBadgeLabel([obj("website-derived", "feed_item")])).toBe(
      "Feed item",
    );
  });

  test("mixed sections say mixed sources", () => {
    expect(
      claimBadgeLabel([
        obj("website-derived", "website_statement"),
        obj("overlay-authored"),
      ]),
    ).toBe("Mixed sources");
  });

  test("unanimous sections keep the single label", () => {
    expect(
      claimBadgeLabel([
        obj("website-derived", "website_statement"),
        obj("website-derived", "website_statement"),
      ]),
    ).toBe("Website statement");
  });
});
