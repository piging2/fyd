/**
 * Semantic diff: the twin diff engine.
 * Change detection, affected bindings, owner conflicts, typed actions.
 * Synthetic graphs only; no customer facts.
 */
import { diffTwin, renderSemanticDiffReport } from "../semantic-diff";
import { normalizeOwnerIntent } from "../owner-intent";
import type { BindingManifest, DependencyManifest } from "../manifest";
import type { OwnerFieldCorrection, PingObject, PingRelationship } from "@/lib/ping/types";
import type { ObjectGraph } from "../../sitespec/types";
import { makeObject, tradeGraph } from "./fixtures";

function getObject(g: ObjectGraph, id: string): PingObject {
  const o = g.objects.find((x) => x.id === id);
  if (!o) throw new Error("missing object " + id);
  return o;
}

function getRelationship(g: ObjectGraph, id: string): PingRelationship {
  const r = g.relationships.find((x) => x.id === id);
  if (!r) throw new Error("missing relationship " + id);
  return r;
}

function binding(bindingId: string, opts?: Partial<BindingManifest>): BindingManifest {
  return {
    bindingId,
    component: "Services",
    componentVersion: "registry@1",
    objectField: "static",
    ownerPolicy: "source-only",
    siteSpecVersion: "planner@1",
    claimRef: null,
    classification: "direct",
    factConfidence: 0.8,
    presentationConfidence: 0.8,
    ...(opts ?? {}),
  };
}

function manifestWith(bindings: BindingManifest[]): DependencyManifest {
  return {
    version: 1,
    plannerVersion: "planner@1",
    tenantId: "test-tenant",
    bindings,
    notes: [],
  };
}

const PHONE_CORRECTION: OwnerFieldCorrection = {
  field: "phone",
  label: "Phone",
  sourceValue: "555-0100",
  ownerValue: "555-0199",
  correctedAt: "2026-09-20T00:00:00.000Z",
  actorLabel: "Demo Owner (seeded, unverified)",
  basis: "Owner correction: the owner says this is the main number.",
};

describe("semantic diff", () => {
  test("empty diff for identical graphs", () => {
    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph: tradeGraph(),
      newGraph: tradeGraph(),
      manifest: manifestWith([]),
      intent: normalizeOwnerIntent(),
      ownerAssertions: [],
    });
    expect(d.changed).toBe(false);
    expect(d.hasConflicts).toBe(false);
    expect(d.objectChanges).toEqual([]);
    expect(d.relationshipChanges).toEqual([]);
    expect(d.affectedBindings).toEqual([]);
    expect(d.conflicts).toEqual([]);
    expect(d.actions).toEqual([
      {
        kind: "no-op",
        target: "test-tenant",
        reason: "no source changes and no owner conflicts",
      },
    ]);
  });

  test("detects object and relationship changes", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    const biz = getObject(newGraph, "biz-trade");
    biz.fields = { ...biz.fields, phone: "555-0111" };
    newGraph.objects.push(
      makeObject("svc-sewer", "ping.social.service@1", { title: "Sewer lines" }),
    );
    newGraph.objects = newGraph.objects.filter((o) => o.id !== "post-1");
    newGraph.relationships = newGraph.relationships.filter((r) => r.id !== "rel-6");
    getRelationship(newGraph, "rel-1").status = "inactive";

    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:Contact:0", { component: "Contact", objectField: "object:biz-trade" }),
      ]),
      intent: normalizeOwnerIntent(),
      ownerAssertions: [],
    });

    expect(d.changed).toBe(true);
    expect(d.objectChanges.map((c) => c.kind + ":" + c.objectId)).toEqual([
      "fields-changed:biz-trade",
      "removed:post-1",
      "added:svc-sewer",
    ]);
    const phoneChange = d.objectChanges.find((c) => c.objectId === "biz-trade");
    expect(phoneChange && phoneChange.fields).toEqual(["phone"]);
    expect(d.relationshipChanges.map((c) => c.kind + ":" + c.relationshipId)).toEqual([
      "status-changed:rel-1",
      "removed:rel-6",
    ]);
    expect(d.actions[0].kind).toBe("reverify-graph");
    expect(d.actions[0].target).toBe("graph:test-tenant");
    const regen = d.actions.find((a) => a.kind === "regenerate-binding");
    expect(regen && regen.target).toBe("home:Contact:0");
  });

  test("provenance change flags claim-level bindings", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    const biz = getObject(newGraph, "biz-trade");
    biz.provenance = {
      ...biz.provenance,
      ref: "website-ingestion:https://example.com/new-page",
    };

    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:Hero:0", {
          component: "Hero",
          objectField: "static",
          claimRef: "website-ingestion:https://example.com/",
        }),
        binding("home:Contact:0", {
          component: "Contact",
          objectField: "object:biz-trade",
        }),
      ]),
      intent: normalizeOwnerIntent(),
      ownerAssertions: [],
    });

    const change = d.objectChanges.find((c) => c.objectId === "biz-trade");
    expect(change && change.kind).toBe("provenance-changed");
    expect(change && change.claimRefBefore).toBe("website-ingestion:https://example.com/");
    expect(change && change.claimRefAfter).toBe(
      "website-ingestion:https://example.com/new-page",
    );
    const flagged = d.affectedBindings.map((b) => b.bindingId);
    expect(flagged).toContain("home:Hero:0");
    expect(flagged).toContain("home:Contact:0");
    const hero = d.affectedBindings.find((b) => b.bindingId === "home:Hero:0");
    expect(hero && hero.reason).toContain("claim");
  });

  test("prohibited positioning in new source text is a conflict, never silent", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    getObject(newGraph, "svc-drains").description =
      "The cheapest drain cleaning in the valley.";

    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:Services:1", { objectField: "object:svc-drains" }),
      ]),
      intent: normalizeOwnerIntent({ prohibitedPositioning: ["cheapest"] }),
      ownerAssertions: [],
    });

    expect(d.hasConflicts).toBe(true);
    expect(d.conflicts).toHaveLength(1);
    const conflict = d.conflicts[0];
    expect(conflict.kind).toBe("prohibited-positioning");
    expect(conflict.key).toBe("prohibited-positioning/svc-drains");
    expect(conflict.blockedBy).toContain("\"cheapest\"");
    const kinds = d.actions.map((a) => a.kind);
    expect(kinds).toContain("review-owner-conflict");
    const review = d.actions.find((a) => a.kind === "review-owner-conflict");
    expect(review && review.target).toBe("prohibited-positioning/svc-drains");
    // Review gates regeneration: the review action sorts before the
    // regenerate action for the touched surface.
    const regenIdx = d.actions.findIndex(
      (a) => a.kind === "regenerate-binding" && a.target === "home:Services:1",
    );
    const reviewIdx = d.actions.findIndex((a) => a.kind === "review-owner-conflict");
    expect(regenIdx).toBeGreaterThan(-1);
    expect(reviewIdx).toBeLessThan(regenIdx);
  });

  test("word-boundary matching avoids false positives", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    // "bestiality" must not trip the "best" predicate; "cheapest" must trip.
    getObject(newGraph, "svc-drains").description = "A word about bestiality.";
    const clean = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([]),
      intent: normalizeOwnerIntent({ prohibitedPositioning: ["best"] }),
      ownerAssertions: [],
    });
    expect(clean.hasConflicts).toBe(false);

    const newGraph2 = tradeGraph();
    getObject(newGraph2, "svc-drains").description = "The BEST plumber, guaranteed.";
    const hit = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph: newGraph2,
      manifest: manifestWith([]),
      intent: normalizeOwnerIntent({ prohibitedPositioning: ["best"] }),
      ownerAssertions: [],
    });
    expect(hit.hasConflicts).toBe(true);
    expect(hit.conflicts[0].blockedBy).toContain("\"best\"");
  });

  test("owner override collision flags drift; the owner still wins", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    getObject(newGraph, "biz-trade").fields = {
      ...getObject(newGraph, "biz-trade").fields,
      phone: "555-0111",
    };

    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:Contact:0", {
          component: "Contact",
          objectField: "object:biz-trade",
          ownerPolicy: "owner-wins",
          classification: "owner_authored",
        }),
      ]),
      intent: normalizeOwnerIntent(),
      ownerAssertions: [{ objectId: "biz-trade", correction: PHONE_CORRECTION }],
    });

    expect(d.hasConflicts).toBe(true);
    expect(d.conflicts).toHaveLength(1);
    const conflict = d.conflicts[0];
    expect(conflict.kind).toBe("owner-override-collision");
    expect(conflict.key).toBe("owner-override/biz-trade/phone");
    expect(conflict.blockedBy).toContain("owner-correction");
    // The owner value is named in the conflict: the correction is not lost.
    expect(conflict.detail).toContain("555-0199");
    const drift = d.actions.find((a) => a.kind === "record-source-drift");
    expect(drift && drift.target).toBe("owner-override/biz-trade/phone");
    // Nothing in the action set overwrites owner state: the typed action
    // vocabulary has no overwrite or apply-owner action.
    for (const a of d.actions) {
      expect([
        "no-op",
        "reverify-graph",
        "review-owner-conflict",
        "record-source-drift",
        "regenerate-binding",
      ]).toContain(a.kind);
    }
  });

  test("no drift, no conflict when the source still matches the correction", () => {
    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph: tradeGraph(),
      newGraph: tradeGraph(),
      manifest: manifestWith([]),
      intent: normalizeOwnerIntent(),
      ownerAssertions: [{ objectId: "biz-trade", correction: PHONE_CORRECTION }],
    });
    expect(d.hasConflicts).toBe(false);
    expect(d.actions.map((a) => a.kind)).toEqual(["no-op"]);
  });

  test("operating constraint collision blocks regeneration of the removed component", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    getObject(newGraph, "biz-trade").description = "Now offering weekend hours.";

    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:CTA:0", {
          component: "CTA",
          objectField: "object:biz-trade",
        }),
        binding("home:Contact:0", {
          component: "Contact",
          objectField: "object:biz-trade",
        }),
      ]),
      intent: normalizeOwnerIntent({ operatingConstraints: ["no-online-booking"] }),
      ownerAssertions: [],
    });

    const conflict = d.conflicts.find(
      (c) => c.kind === "operating-constraint-collision",
    );
    expect(conflict).toBeDefined();
    expect(conflict && conflict.key).toBe("operating-constraint/home:CTA:0");
    expect(conflict && conflict.blockedBy).toContain("\"no-online-booking\"");
    const kinds = d.actions.map((a) => a.kind);
    expect(kinds).toContain("review-owner-conflict");
    // The CTA binding is NOT proposed for regeneration: the review is the gate.
    expect(
      d.actions.filter(
        (a) => a.kind === "regenerate-binding" && a.target === "home:CTA:0",
      ),
    ).toHaveLength(0);
    // The unconstrained Contact binding still regenerates.
    expect(
      d.actions.filter(
        (a) => a.kind === "regenerate-binding" && a.target === "home:Contact:0",
      ),
    ).toHaveLength(1);
  });

  test("deterministic across runs and across input order", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    getObject(newGraph, "biz-trade").fields = {
      ...getObject(newGraph, "biz-trade").fields,
      phone: "555-0111",
    };
    const bindings = [
      binding("home:Contact:0", { objectField: "object:biz-trade" }),
      binding("home:Hero:0", {
        component: "Hero",
        claimRef: "website-ingestion:https://example.com/",
      }),
    ];
    const input = {
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith(bindings),
      intent: normalizeOwnerIntent({ prohibitedPositioning: ["cheapest"] }),
      ownerAssertions: [{ objectId: "biz-trade", correction: PHONE_CORRECTION }],
    };
    const first = JSON.stringify(diffTwin(input));
    const second = JSON.stringify(diffTwin(input));
    expect(second).toBe(first);

    // Shuffled input order must not change the diff: everything is sorted.
    const shuffled = {
      ...input,
      oldGraph: {
        objects: [...oldGraph.objects].reverse(),
        relationships: [...oldGraph.relationships].reverse(),
      },
      newGraph: {
        objects: [...newGraph.objects].reverse(),
        relationships: [...newGraph.relationships].reverse(),
      },
      manifest: manifestWith([...bindings].reverse()),
    };
    expect(JSON.stringify(diffTwin(shuffled))).toBe(first);
  });

  test("renders a readable markdown report", () => {
    const oldGraph = tradeGraph();
    const newGraph = tradeGraph();
    getObject(newGraph, "svc-drains").description =
      "The cheapest drain cleaning in the valley.";
    const d = diffTwin({
      tenantId: "test-tenant",
      oldGraph,
      newGraph,
      manifest: manifestWith([
        binding("home:Services:1", { objectField: "object:svc-drains" }),
      ]),
      intent: normalizeOwnerIntent({ prohibitedPositioning: ["cheapest"] }),
      ownerAssertions: [],
    });
    const report = renderSemanticDiffReport(d);
    expect(report).toContain("# Semantic diff: test-tenant");
    expect(report).toContain("prohibited-positioning");
    expect(report).toContain("review-owner-conflict");
    expect(report).toContain("home:Services:1");
  });
});
