/**
 * Lane D tests: the presentation-intent apply layer.
 *
 * Law under test: the layer is pure, applies approved directives over the
 * compiled spec, never touches FACTS (graph) or the DESIGN SYSTEM (theme),
 * refuses tampered digests and missing targets honestly, and is
 * idempotent.
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs
 */

import { applyPresentationIntent } from "../apply-layer";
import { proposeFromSiteIntent } from "../propose";
import { proposalDigest } from "../../proceduralize/patch";
import type {
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
} from "../types";

function obj(id: string, title: string): PingObject {
  return {
    id,
    schema: "ping.social.service@1",
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
    themeTokens: { accent: "#000" } as unknown as FYDThemeTokens,
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
    objects: [obj("biz-1", "Test Business"), obj("svc-1", "Pergola Design Consultations")],
    relationships: [],
  };
}

function blockWith(d: PresentationIntentDirective): PresentationIntentBlock {
  return {
    directives: [d],
    provenance: {
      kind: "owner-presentation-intent",
      note: "test block",
      eventIds: [],
    },
  };
}

function orderOf(s: FYDSiteSpec): string[] {
  return s.pages[0].sections.map((x) => x.component);
}

function approvedDirective(
  specIn: FYDSiteSpec,
  siteIntent: PresentationIntentDirective["siteIntent"],
): PresentationIntentDirective {
  const outcome = proposeFromSiteIntent(specIn, siteIntent);
  if (!outcome.ok) throw new Error("test setup failed: " + outcome.error);
  return {
    intentId: "pi-test-1",
    siteIntent,
    proposal: outcome.proposal,
    approval: {
      proposalDigest: outcome.proposal.proposalDigest,
      approvedBy: "demo-owner (seeded, unverified)",
      approvedAt: "2026-09-21T00:00:00Z",
      note: "DEMO OWNER MODE - not real authentication. No identity was verified.",
    },
  };
}

describe("applyPresentationIntent", () => {
  test("applies an approved reorder: Services moves first; input is not mutated", () => {
    const before = spec();
    const snapshot = JSON.stringify(before);
    const g = graph();
    const graphSnapshot = JSON.stringify(g);
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const result = applyPresentationIntent(before, blockWith(d), g);
    expect(orderOf(result.spec)).toEqual(["Services", "Hero", "Testimonials"]);
    expect(result.applied).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
    // Pure: input spec and graph untouched.
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(g)).toBe(graphSnapshot);
  });

  test("theme tokens are never touched by the layer", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const result = applyPresentationIntent(before, blockWith(d), graph());
    expect(result.spec.themeTokens).toEqual(before.themeTokens);
  });

  test("a design-system (theme) directive is refused, not applied", () => {
    const before = spec();
    const real = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const { proposalDigest: _drop, ...body } = real.proposal;
    const themeProposal = { ...body, component: "theme" };
    const d: PresentationIntentDirective = {
      intentId: "pi-theme",
      siteIntent: {
        kind: "set_theme_token",
        token: "accent",
        value: "#fff",
      },
      proposal: { ...themeProposal, proposalDigest: proposalDigest(themeProposal) },
      approval: real.approval,
    };
    const result = applyPresentationIntent(before, blockWith(d), graph());
    expect(orderOf(result.spec)).toEqual(orderOf(before));
    expect(result.applied).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toContain("design system");
  });

  test("a tampered proposal (digest mismatch) is refused", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const tampered: PresentationIntentDirective = {
      ...d,
      proposal: {
        ...d.proposal,
        propsDiff: { ...d.proposal.propsDiff, moveTo: 99 },
      },
    };
    const result = applyPresentationIntent(before, blockWith(tampered), graph());
    expect(orderOf(result.spec)).toEqual(orderOf(before));
    expect(result.applied).toHaveLength(0);
    expect(result.unresolved[0].reason).toContain("digest does not verify");
  });

  test("a directive whose section no longer exists is unresolved, not dropped or guessed", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const moved = applyPresentationIntent(before, blockWith(d), graph()).spec;
    // Simulate a source change that removed Services entirely.
    const pruned = JSON.parse(JSON.stringify(moved)) as FYDSiteSpec;
    pruned.pages[0].sections = pruned.pages[0].sections.filter(
      (s) => s.component !== "Services",
    );
    const again = applyPresentationIntent(pruned, blockWith(d), graph());
    expect(again.applied).toHaveLength(0);
    expect(again.unresolved).toHaveLength(1);
    expect(again.unresolved[0].intentId).toBe("pi-test-1");
    expect(again.unresolved[0].reason).toContain("no longer exists");
    // Spec is otherwise unchanged: nothing was guessed.
    expect(orderOf(again.spec)).toEqual(orderOf(pruned));
  });

  test("position-shifted section ids resolve via component fallback (re-apply is a no-op)", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const first = applyPresentationIntent(before, blockWith(d), graph());
    expect(orderOf(first.spec)).toEqual(["Services", "Hero", "Testimonials"]);
    // The stored section id ("home:Services:1") no longer matches the moved
    // spec ("home:Services:0"): the fallback still pins the section.
    const second = applyPresentationIntent(first.spec, blockWith(d), graph());
    expect(second.applied).toHaveLength(1);
    expect(orderOf(second.spec)).toEqual(["Services", "Hero", "Testimonials"]);
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
  });

  test("proposing a no-op (already first) refuses honestly at propose time", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    const moved = applyPresentationIntent(before, blockWith(d), graph()).spec;
    const outcome = proposeFromSiteIntent(moved, {
      kind: "reorder_section",
      pageSlug: "home",
      sectionId: "home:Services:0",
      toIndex: 0,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("already");
  });

  test("hide/show directive applies and a missing object in set_featured refuses", () => {
    const before = spec();
    const hide = approvedDirective(before, {
      kind: "toggle_section",
      pageSlug: "home",
      sectionId: "home:Testimonials:2",
      hidden: true,
    });
    const hidden = applyPresentationIntent(before, blockWith(hide), graph());
    expect(
      hidden.spec.pages[0].sections.find((s) => s.component === "Testimonials")
        ?.presentation.hidden,
    ).toBe(true);

    const feat = approvedDirective(before, {
      kind: "set_featured",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-1", "svc-gone"],
    });
    const g = graph();
    const featResult = applyPresentationIntent(before, blockWith(feat), g);
    expect(featResult.applied).toHaveLength(0);
    expect(featResult.unresolved[0].reason).toContain("no longer in the site's evidence");
  });
});
