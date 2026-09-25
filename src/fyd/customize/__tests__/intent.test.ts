/**
 * Lane D tests: intent parsing (deterministic, honest unsupported) and
 * resolution against the site's evidence.
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs
 */

import {
  intentDigest,
  parseCustomizationIntent,
  resolveCustomizationIntent,
} from "../intent";
import { isUnsupported } from "../types";
import type {
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

function obj(id: string, title: string, schema = "ping.social.service@1"): PingObject {
  return {
    id,
    schema,
    controllerId: "ctrl-1",
    visibility: "public",
    title,
    description: "",
    fields: {},
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    provenance: { ref: "test" } as unknown as PingObject["provenance"],
  };
}

function spec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "biz-1",
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "test",
      generatedAt: "2026-09-21T00:00:00Z",
    },
    themeTokens: {} as unknown as FYDThemeTokens,
    navigation: [],
    pages: [
      {
        slug: "home",
        title: "Home",
        navLabel: "Home",
        sections: [
          {
            id: "home:Hero:0",
            component: "Hero",
            query: { kind: "owner" },
            presentation: {},
          },
          {
            id: "home:Services:1",
            component: "Services",
            query: { kind: "all", schema: "ping.social.service@1" },
            presentation: { heading: "Our services" },
          },
          {
            id: "home:Testimonials:2",
            component: "Testimonials",
            query: { kind: "static" },
            presentation: {},
          },
        ],
      },
    ],
  };
}

function graph(): ObjectGraph {
  return {
    objects: [
      obj("biz-1", "Test Business", "ping.social.business@1"),
      obj("svc-1", "Pergola Design Consultations"),
      obj("svc-2", "Deck Construction"),
    ],
    relationships: [],
  };
}

describe("parseCustomizationIntent", () => {
  test("the requested phrase parses to a typed promote_first intent", () => {
    const r = parseCustomizationIntent(
      "Make emergency service the first thing people see",
    );
    expect(isUnsupported(r)).toBe(false);
    if (isUnsupported(r)) return;
    expect(r.intent).toEqual({ kind: "promote_first", target: "emergency service" });
  });

  test("parse is deterministic: same text, same intent and digest", () => {
    const a = parseCustomizationIntent("Put the services section first");
    const b = parseCustomizationIntent("Put the services section first");
    expect(isUnsupported(a)).toBe(false);
    expect(isUnsupported(b)).toBe(false);
    if (isUnsupported(a) || isUnsupported(b)) return;
    expect(a.intent).toEqual(b.intent);
    expect(a.intentDigest).toBe(b.intentDigest);
    expect(a.intentDigest).toBe(intentDigest(a.intent));
  });

  test("prominence family: move X to the top, move X first, lead with X", () => {
    for (const text of [
      "Move services to the top",
      "Move services first",
      "Lead with services",
      "Put services first",
    ]) {
      const r = parseCustomizationIntent(text);
      expect(isUnsupported(r)).toBe(false);
      if (!isUnsupported(r)) {
        expect(r.intent.kind).toBe("promote_first");
        expect(r.intent.target).toBe("services");
      }
    }
  });

  test("owner NL 'Move emergency plumbing first' parses to promote_first", () => {
    const r = parseCustomizationIntent("Move emergency plumbing first.");
    expect(isUnsupported(r)).toBe(false);
    if (isUnsupported(r)) return;
    expect(r.intent).toEqual({
      kind: "promote_first",
      target: "emergency plumbing",
    });
  });

  test("feature family parses", () => {
    const r = parseCustomizationIntent("Feature Pergola Design Consultations");
    expect(isUnsupported(r)).toBe(false);
    if (isUnsupported(r)) return;
    expect(r.intent).toEqual({
      kind: "feature_object",
      target: "pergola design consultations",
    });
  });

  test("hide/show section parses", () => {
    const h = parseCustomizationIntent("Hide the testimonials section");
    expect(isUnsupported(h)).toBe(false);
    if (!isUnsupported(h)) {
      expect(h.intent.kind).toBe("hide_section");
      expect(h.intent.target).toBe("testimonials");
    }
    const s = parseCustomizationIntent("Show the testimonials section");
    expect(isUnsupported(s)).toBe(false);
    if (!isUnsupported(s)) expect(s.intent.kind).toBe("show_section");
  });

  test("hide/deactivate object parses to hide_object", () => {
    const h = parseCustomizationIntent("hide the Heating & Cooling service");
    expect(isUnsupported(h)).toBe(false);
    if (!isUnsupported(h)) {
      expect(h.intent).toEqual({
        kind: "hide_object",
        target: "heating & cooling service",
      });
    }
    const d = parseCustomizationIntent("deactivate deck construction");
    expect(isUnsupported(d)).toBe(false);
    if (!isUnsupported(d)) {
      expect(d.intent).toEqual({
        kind: "hide_object",
        target: "deck construction",
      });
    }
  });

  test("explicit 'section' keeps the hide_section parsed kind", () => {
    const h = parseCustomizationIntent("hide the services section");
    expect(isUnsupported(h)).toBe(false);
    if (!isUnsupported(h)) {
      expect(h.intent).toEqual({ kind: "hide_section", target: "services" });
    }
  });

  test("unsupported language returns unsupported, never a guess", () => {
    for (const text of [
      "make the site blue",
      "change the font to comic sans",
      "add a booking form",
      "write a poem about carpentry",
      "",
    ]) {
      const r = parseCustomizationIntent(text);
      expect(isUnsupported(r)).toBe(true);
      if (isUnsupported(r)) {
        expect(r.reason).toContain("This wave supports");
      }
    }
  });
});

describe("resolveCustomizationIntent", () => {
  test("promote_first on an existing section resolves to reorder_section toIndex 0", () => {
    const parsed = parseCustomizationIntent("Make the services section the first thing people see");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    expect(res.siteIntent).toEqual({
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
  });

  test("'emergency service' names nothing in the evidence: honest unresolved", () => {
    const parsed = parseCustomizationIntent(
      "Make emergency service the first thing people see",
    );
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    // Must not invent an emergency-service section or claim.
    expect(res.reason).toContain("emergency service");
    expect(res.reason).toMatch(/No section or object named/);
  });

  test("promote_first on an existing OBJECT resolves to reorder_object moving it first", () => {
    const parsed = parseCustomizationIntent("Move deck construction to the top");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    // Default query order is svc-1, svc-2 (same timestamp, id tie-break);
    // the directive moves svc-2 first inside the Services section.
    expect(res.siteIntent).toEqual({
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-2", "svc-1"],
    });
    expect(res.resolutionNote).toContain("Deck Construction");
  });
  test("exact object title beats a shorter fuzzy match", () => {
    const g = graph();
    g.objects.push(obj("svc-3", "Plumbing"), obj("svc-4", "Emergency Plumbing"));
    const parsed = parseCustomizationIntent("Move emergency plumbing first.");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), g, parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    // "Emergency Plumbing" is the exact title match for the target; the old
    // shortest-title-first fuzzy sort picked "Plumbing" (svc-3) instead.
    expect(res.siteIntent).toEqual({
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-4", "svc-1", "svc-2", "svc-3"],
    });
    expect(res.resolutionNote).toContain("Emergency Plumbing");
  });

  test("promote_first on an object already first is refused honestly", () => {
    const parsed = parseCustomizationIntent("Put pergola design consultations first");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    expect(res.reason).toContain("Pergola Design Consultations");
    expect(res.reason).toContain("already first");
  });

  test("promote_first on an object shown in no section is unresolved", () => {
    const g = graph();
    g.objects.push({
      ...g.objects[0],
      id: "doc-1",
      schema: "ping.social.document@1",
      title: "Price List",
    });
    const parsed = parseCustomizationIntent("Move price list to the top");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), g, parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    expect(res.reason).toContain("Price List");
    expect(res.reason).toContain("not shown in any section");
  });

  test("feature_object resolves to set_featured in the containing section", () => {
    const parsed = parseCustomizationIntent("Feature pergola design consultations");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    expect(res.siteIntent.kind).toBe("set_featured");
    expect((res.siteIntent as { objectIds: string[] }).objectIds).toContain("svc-1");
  });

  test("feature_object on a missing object is unresolved", () => {
    const parsed = parseCustomizationIntent("Feature emergency response");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(false);
  });

  test("hide/show on a missing section is unresolved", () => {
    const parsed = parseCustomizationIntent("Hide the pricing section");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(false);
  });

  test("hide_object on an object resolves to deactivate_object", () => {
    const parsed = parseCustomizationIntent("hide deck construction");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    expect(parsed.intent.kind).toBe("hide_object");
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    expect(res.siteIntent).toEqual({
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-2",
    });
    expect(res.resolutionNote).toContain("Deck Construction");
  });

  test("hide_object where the target names a section still hides the section", () => {
    const parsed = parseCustomizationIntent("hide services");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    expect(parsed.intent.kind).toBe("hide_object");
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(true);
    if (!res.resolved) return;
    // Section-level hide wins even though the parse kind is hide_object.
    expect(res.siteIntent).toEqual({
      kind: "toggle_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      hidden: true,
    });
  });

  test("hide_object on an unknown name is unresolved", () => {
    const parsed = parseCustomizationIntent("hide emergency response");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), graph(), parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    expect(res.reason).toContain("emergency response");
  });

  test("hide_object on an object shown in no section is unresolved", () => {
    const g = graph();
    g.objects.push({
      ...g.objects[0],
      id: "doc-1",
      schema: "ping.social.document@1",
      title: "Price List",
    });
    const parsed = parseCustomizationIntent("hide price list");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(spec(), g, parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    expect(res.reason).toContain("Price List");
    expect(res.reason).toContain("not shown in any section");
  });

  test("hide_object on an already-hidden object is refused honestly", () => {
    const s = spec();
    s.pages[0].sections[1].presentation.hiddenObjectIds = ["svc-2"];
    const parsed = parseCustomizationIntent("hide deck construction");
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) return;
    const res = resolveCustomizationIntent(s, graph(), parsed.intent);
    expect(res.resolved).toBe(false);
    if (res.resolved) return;
    expect(res.reason).toContain("Deck Construction");
    expect(res.reason).toContain("already hidden");
  });
});
