/**
 * site_patch proposal tests: intents produce deterministic digests,
 * invalid intents are rejected, and applying a proposal yields a new spec
 * without mutating the original.
 */

import { HAPPY_PLACE_GRAPH } from "../__fixtures__/happy-place-graph";
import { generateSiteSpec } from "../generator";
import { applySitePatch, proposalDigest, proposeSitePatch } from "../patch";
import { sha256Hex } from "../sha256";
import type { FYDSiteSpec } from "../../sitespec/types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };

function spec(): FYDSiteSpec {
  return generateSiteSpec(HAPPY_PLACE_GRAPH, OPTS);
}

describe("proposeSitePatch", () => {
  test("reorder intent produces a deterministic digest", () => {
    const s = spec();
    const sectionId = s.pages[0].sections[1].id;
    const a = proposeSitePatch(s, { kind: "reorder_section", pageSlug: "home", sectionId, toIndex: 0 });
    const b = proposeSitePatch(s, { kind: "reorder_section", pageSlug: "home", sectionId, toIndex: 0 });
    expect(a.ok).toBe(true);
    expect(a.proposal!.proposalDigest).toBe(b.proposal!.proposalDigest);
    expect(a.proposal!.propsDiff).toEqual({ moveFrom: 1, moveTo: 0 });
  });

  test("out-of-range reorder is rejected", () => {
    const s = spec();
    const sectionId = s.pages[0].sections[0].id;
    const r = proposeSitePatch(s, { kind: "reorder_section", pageSlug: "home", sectionId, toIndex: 99 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("out of range");
  });

  test("toggle, featured, copy, and token intents", () => {
    const s = spec();
    const sectionId = s.pages[0].sections[2].id;
    const toggle = proposeSitePatch(s, { kind: "toggle_section", pageSlug: "home", sectionId, hidden: true });
    expect(toggle.proposal!.propsDiff).toEqual({ "presentation.hidden": true });

    const featured = proposeSitePatch(s, {
      kind: "set_featured",
      pageSlug: "home",
      sectionId,
      objectIds: ["hp-service-fences", "hp-service-decks", "hp-service-decks"],
    });
    expect(featured.proposal!.propsDiff).toEqual({
      "presentation.featuredIds": ["hp-service-decks", "hp-service-fences"],
    });

    const copy = proposeSitePatch(s, {
      kind: "edit_copy",
      pageSlug: "home",
      sectionId,
      heading: "Our craft",
    });
    expect(copy.proposal!.propsDiff).toEqual({ "presentation.heading": "Our craft" });

    const token = proposeSitePatch(s, { kind: "set_theme_token", token: "accent", value: "#123456" });
    expect(token.proposal!.propsDiff).toEqual({ "themeTokens.accent": "#123456" });

    const badToken = proposeSitePatch(s, { kind: "set_theme_token", token: "accent", value: "  " });
    expect(badToken.ok).toBe(false);
  });

  test("sha256 matches the known test vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("digest matches the ask-composer canonicalization shape", () => {
    const body = {
      kind: "site_patch" as const,
      targetPage: "home",
      targetSection: "home:Hero:0",
      component: "Hero",
      propsDiff: { "presentation.hidden": true },
      reason: "Hide section.",
    };
    const d1 = proposalDigest(body);
    const d2 = proposalDigest({ ...body, propsDiff: { "presentation.hidden": true } });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("applySitePatch returns a new spec and re-derives section ids after a move", () => {
    const s = spec();
    const sectionId = s.pages[0].sections[1].id;
    const proposal = proposeSitePatch(s, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId,
      toIndex: 0,
    }).proposal!;
    const next = applySitePatch(s, proposal);
    expect(next).not.toBe(s);
    expect(s.pages[0].sections[1].id).toBe(sectionId);
    expect(next.pages[0].sections[0].component).toBe("BusinessSummary");
    next.pages[0].sections.forEach((sec, i) => {
      expect(sec.id).toBe("home:" + sec.component + ":" + i);
    });
  });
});
