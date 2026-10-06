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
import {
  applyHiddenObjects,
  siteDeactivatedObjectIds,
} from "../../components/renderer";
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
    objects: [
      obj("biz-1", "Test Business", "ping.social.business@1"),
      obj("svc-1", "Pergola Design Consultations"),
      obj("svc-2", "Deck Construction"),
    ],
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

  test("reorder_object applies the approved object order to the section", () => {
    const before = spec();
    const g = graph();
    const d = approvedDirective(before, {
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-2", "svc-1"],
    });
    const result = applyPresentationIntent(before, blockWith(d), g);
    expect(result.applied).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
    const sec = result.spec.pages[0].sections.find(
      (x) => x.component === "Services",
    )!;
    expect(sec.presentation.objectOrder).toEqual(["svc-2", "svc-1"]);
    // Facts untouched: the graph keeps its own order.
    expect(g.objects.map((o) => o.id)).toEqual([
      "biz-1",
      "svc-1",
      "svc-2",
    ]);
  });

  test("reorder_object with an object gone from evidence is unresolved, kept not dropped", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-2", "svc-gone"],
    });
    const result = applyPresentationIntent(before, blockWith(d), graph());
    expect(result.applied).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].intentId).toBe("pi-test-1");
    expect(result.unresolved[0].reason).toContain(
      "no longer in the site's evidence",
    );
  });

  test("reorder_object proposal digest binds the exact order; re-apply is idempotent", () => {
    const before = spec();
    const g = graph();
    const d = approvedDirective(before, {
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds: ["svc-2", "svc-1"],
    });
    const first = applyPresentationIntent(before, blockWith(d), g);
    const second = applyPresentationIntent(first.spec, blockWith(d), g);
    expect(second.applied).toHaveLength(1);
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
    // A proposal for the same order against the already-ordered spec is a no-op refusal.
    const again = proposeFromSiteIntent(
      first.spec,
      {
        kind: "reorder_object",
        pageSlug: "home",
        sectionId: "home:Services:1",
        objectIds: ["svc-2", "svc-1"],
      },
      g,
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("already in that order");
  });

  test("deactivate_object records the hidden object id on the section", () => {
    const before = spec();
    const g = graph();
    const d = approvedDirective(before, {
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-2",
    });
    // The proposal binds the exact hidden array.
    expect(d.proposal.propsDiff).toEqual({
      "presentation.hiddenObjectIds": ["svc-2"],
    });
    const result = applyPresentationIntent(before, blockWith(d), g);
    expect(result.applied).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
    const sec = result.spec.pages[0].sections.find(
      (x) => x.component === "Services",
    )!;
    expect(sec.presentation.hiddenObjectIds).toEqual(["svc-2"]);
    // Facts untouched: the object stays public in the graph.
    expect(g.objects.find((o) => o.id === "svc-2")!.visibility).toBe("public");
    // Input spec is not mutated.
    expect(
      before.pages[0].sections[1].presentation.hiddenObjectIds,
    ).toBeUndefined();
  });

  test("deactivate_object with an object gone from evidence is unresolved, kept not dropped", () => {
    const before = spec();
    const d = approvedDirective(before, {
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-gone",
    });
    const result = applyPresentationIntent(before, blockWith(d), graph());
    expect(result.applied).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].intentId).toBe("pi-test-1");
    expect(result.unresolved[0].reason).toContain(
      "no longer in the site's evidence",
    );
  });

  test("deactivate_object re-apply is idempotent; re-propose is a no-op refusal", () => {
    const before = spec();
    const g = graph();
    const d = approvedDirective(before, {
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-2",
    });
    const first = applyPresentationIntent(before, blockWith(d), g);
    const second = applyPresentationIntent(first.spec, blockWith(d), g);
    expect(second.applied).toHaveLength(1);
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
    // A proposal for the same object against the already-deactivated spec is
    // a no-op refusal.
    const again = proposeFromSiteIntent(
      first.spec,
      {
        kind: "deactivate_object",
        pageSlug: "home",
        sectionId: "home:Services:1",
        objectId: "svc-2",
      },
      g,
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("already hidden");
  });

  test("deactivate_object composes: a second deactivation keeps the first", () => {
    const before = spec();
    const g = graph();
    const d1 = approvedDirective(before, {
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-2",
    });
    const after1 = applyPresentationIntent(before, blockWith(d1), g).spec;
    const d2 = approvedDirective(after1, {
      kind: "deactivate_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectId: "svc-1",
    });
    const after2 = applyPresentationIntent(
      after1,
      blockWith(d2),
      g,
    ).spec;
    const sec = after2.pages[0].sections.find(
      (x) => x.component === "Services",
    )!;
    expect(sec.presentation.hiddenObjectIds).toEqual(["svc-1", "svc-2"]);
  });
});

describe("applyHiddenObjects", () => {
  test("filters hidden ids, keeps order, ignores unknown ids", () => {
    const objs = [obj("svc-1", "A"), obj("svc-2", "B"), obj("svc-3", "C")];
    const ids = (arr: typeof objs) => arr.map((o) => o.id);
    expect(ids(applyHiddenObjects(objs, undefined))).toEqual([
      "svc-1",
      "svc-2",
      "svc-3",
    ]);
    expect(ids(applyHiddenObjects(objs, []))).toEqual([
      "svc-1",
      "svc-2",
      "svc-3",
    ]);
    expect(ids(applyHiddenObjects(objs, ["svc-2"]))).toEqual([
      "svc-1",
      "svc-3",
    ]);
    expect(ids(applyHiddenObjects(objs, ["nope"]))).toEqual([
      "svc-1",
      "svc-2",
      "svc-3",
    ]);
    expect(ids(applyHiddenObjects(objs, ["svc-2", "svc-2"]))).toEqual([
      "svc-1",
      "svc-3",
    ]);
  });
});

describe("siteDeactivatedObjectIds", () => {
  function specWithHidden(): FYDSiteSpec {
    const s = spec();
    s.pages[0].sections[1].presentation.hiddenObjectIds = ["svc-2"];
    s.pages[0].sections[2].presentation.hiddenObjectIds = ["svc-2", "svc-4"];
    return s;
  }

  test("returns undefined when nothing is hidden", () => {
    expect(siteDeactivatedObjectIds(spec())).toBeUndefined();
  });

  test("unions every section's hidden ids in spec order, deduplicated", () => {
    expect(siteDeactivatedObjectIds(specWithHidden())).toEqual([
      "svc-2",
      "svc-4",
    ]);
  });

  test("an id hidden in one section excludes it from another section's projection", () => {
    // The Featured Object rail resolves a different section than the one the
    // owner hid the object in. The site-wide set must still exclude it.
    const s = specWithHidden();
    const railObjects = [obj("svc-1", "A"), obj("svc-2", "B"), obj("svc-3", "C")];
    const ids = (arr: typeof railObjects) => arr.map((o) => o.id);
    expect(
      ids(applyHiddenObjects(railObjects, siteDeactivatedObjectIds(s))),
    ).toEqual(["svc-1", "svc-3"]);
  });
});
