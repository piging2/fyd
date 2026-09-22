/**
 * Source refresh: OwnerIntent and owner corrections survive re-ingestion.
 * The digest pair is the machine-checkable survival proof.
 * Synthetic graphs only; no customer facts.
 */
import { refreshSource, digestOwnerLayer } from "../source-refresh";
import type { OwnerLayer } from "../source-refresh";
import { normalizeOwnerIntent } from "../owner-intent";
import type { BindingManifest, DependencyManifest } from "../manifest";
import type { OwnerFieldCorrection, PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../../sitespec/types";
import { makeObject, makeRelationship, tradeGraph } from "./fixtures";

function getObject(g: ObjectGraph, id: string): PingObject {
  const o = g.objects.find((x) => x.id === id);
  if (!o) throw new Error("missing object " + id);
  return o;
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

function ownerLayer(): OwnerLayer {
  return {
    intent: normalizeOwnerIntent({
      goals: ["more weekend calls"],
      prohibitedPositioning: ["cheapest"],
      operatingConstraints: ["no-online-booking"],
    }),
    assertions: [{ objectId: "biz-trade", correction: { ...PHONE_CORRECTION } }],
  };
}

describe("source refresh", () => {
  test("clean refresh: source re-derived, owner layer byte-identical", () => {
    const current = tradeGraph();
    const refreshed = tradeGraph();
    getObject(refreshed, "biz-trade").description =
      "Full-service plumbing, now with weekend hours.";
    refreshed.objects.push(
      makeObject("svc-sewer", "ping.social.service@1", { title: "Sewer lines" }),
    );
    refreshed.relationships.push(
      makeRelationship("rel-7", "biz-trade", "provides", "svc-sewer"),
    );
    const layer = ownerLayer();
    const manifest = manifestWith([
      binding("home:Services:0", { objectField: "object:svc-sewer" }),
      binding("home:Contact:0", {
        component: "Contact",
        objectField: "object:biz-trade",
      }),
    ]);
    const layerBefore = JSON.stringify(layer);
    const currentBefore = JSON.stringify(current);

    const r = refreshSource({
      tenantId: "test-tenant",
      currentSource: current,
      refreshedSource: refreshed,
      ownerLayer: layer,
      manifest,
    });

    // The survival proof: digests match, content intact.
    expect(r.ownerLayerIntact).toBe(true);
    expect(r.ownerLayerDigestBefore).toBe(r.ownerLayerDigestAfter);
    expect(r.ownerLayerDigestBefore).toBe(digestOwnerLayer(layer));
    expect(r.ownerLayer.intent.goals).toEqual(["more weekend calls"]);
    expect(r.ownerLayer.intent.prohibitedPositioning).toEqual(["cheapest"]);
    expect(r.ownerLayer.intent.operatingConstraints).toEqual(["no-online-booking"]);
    expect(r.ownerLayer.assertions).toHaveLength(1);
    expect(r.ownerLayer.assertions[0].correction.ownerValue).toBe("555-0199");
    // The source moved: diff carries the change, no conflicts.
    expect(r.diff.changed).toBe(true);
    expect(r.diff.hasConflicts).toBe(false);
    expect(r.diff.actions[0].kind).toBe("reverify-graph");
    expect(r.diff.actions.map((a) => a.kind)).toContain("regenerate-binding");
    // Inputs untouched: the refresh never mutates.
    expect(JSON.stringify(layer)).toBe(layerBefore);
    expect(JSON.stringify(current)).toBe(currentBefore);
  });

  test("refresh with prohibited-positioning conflict: intent survives, conflict surfaced", () => {
    const refreshed = tradeGraph();
    getObject(refreshed, "svc-drains").description =
      "The cheapest drain cleaning in the valley.";
    const layer = ownerLayer();

    const r = refreshSource({
      tenantId: "test-tenant",
      currentSource: tradeGraph(),
      refreshedSource: refreshed,
      ownerLayer: layer,
      manifest: manifestWith([
        binding("home:Services:1", { objectField: "object:svc-drains" }),
      ]),
    });

    expect(r.ownerLayerIntact).toBe(true);
    expect(r.ownerLayer.intent.prohibitedPositioning).toEqual(["cheapest"]);
    expect(r.diff.hasConflicts).toBe(true);
    const conflict = r.diff.conflicts.find(
      (c) => c.kind === "prohibited-positioning",
    );
    expect(conflict).toBeDefined();
    expect(conflict && conflict.key).toBe("prohibited-positioning/svc-drains");
    const review = r.diff.actions.find((a) => a.kind === "review-owner-conflict");
    expect(review && review.target).toBe("prohibited-positioning/svc-drains");
  });

  test("refresh removing a source fact the owner overrode: owner layer retains it", () => {
    const refreshed = tradeGraph();
    // The refreshed source no longer publishes a phone number at all.
    getObject(refreshed, "biz-trade").fields = {
      website: "https://acme-plumbing.example.com/",
      locality: "Grand Junction, Colorado",
    };
    const layer = ownerLayer();

    const r = refreshSource({
      tenantId: "test-tenant",
      currentSource: tradeGraph(),
      refreshedSource: refreshed,
      ownerLayer: layer,
      manifest: manifestWith([
        binding("home:Contact:0", {
          component: "Contact",
          objectField: "object:biz-trade",
          ownerPolicy: "owner-wins",
          classification: "owner_authored",
        }),
      ]),
    });

    // The owner layer still carries the correction: nothing was erased.
    expect(r.ownerLayerIntact).toBe(true);
    expect(r.ownerLayer.assertions).toHaveLength(1);
    expect(r.ownerLayer.assertions[0].correction.ownerValue).toBe("555-0199");
    expect(r.ownerLayer.assertions[0].correction.sourceValue).toBe("555-0100");
    // The removal is recorded as a field change on the object.
    const change = r.diff.objectChanges.find((c) => c.objectId === "biz-trade");
    expect(change && change.kind).toBe("fields-changed");
    expect(change && change.fields).toContain("phone");
    // And the collision is surfaced as drift, never silently dropped.
    const conflict = r.diff.conflicts.find(
      (c) => c.kind === "owner-override-collision",
    );
    expect(conflict).toBeDefined();
    expect(conflict && conflict.key).toBe("owner-override/biz-trade/phone");
    expect(conflict && conflict.detail).toContain("555-0199");
    expect(r.diff.actions.map((a) => a.kind)).toContain("record-source-drift");
  });

  test("refresh removing the whole object under an override keeps the correction", () => {
    const refreshed = tradeGraph();
    refreshed.objects = refreshed.objects.filter((o) => o.id !== "biz-trade");
    refreshed.relationships = refreshed.relationships.filter(
      (r) => r.subject !== "biz-trade" && r.object !== "biz-trade",
    );
    const layer = ownerLayer();

    const r = refreshSource({
      tenantId: "test-tenant",
      currentSource: tradeGraph(),
      refreshedSource: refreshed,
      ownerLayer: layer,
      manifest: manifestWith([]),
    });

    expect(r.ownerLayerIntact).toBe(true);
    expect(r.ownerLayer.assertions).toHaveLength(1);
    const conflict = r.diff.conflicts.find(
      (c) => c.kind === "owner-override-collision",
    );
    expect(conflict).toBeDefined();
    expect(conflict && conflict.detail).toContain("removed object");
    expect(r.diff.objectChanges.find((c) => c.objectId === "biz-trade")?.kind).toBe(
      "removed",
    );
  });

  test("owner-layer digest is insensitive to assertion input order", () => {
    const intent = normalizeOwnerIntent({ goals: ["g"] });
    const a1 = { objectId: "biz-trade", correction: { ...PHONE_CORRECTION } };
    const websiteCorrection: OwnerFieldCorrection = {
      ...PHONE_CORRECTION,
      field: "website",
      label: "Website",
      sourceValue: "https://old.example.com/",
      ownerValue: "https://new.example.com/",
    };
    const a2 = { objectId: "svc-drains", correction: websiteCorrection };
    expect(
      digestOwnerLayer({ intent, assertions: [a1, a2] }),
    ).toBe(digestOwnerLayer({ intent, assertions: [a2, a1] }));
  });

  test("refresh is deterministic", () => {
    const refreshed = tradeGraph();
    getObject(refreshed, "biz-trade").description = "Now with weekend hours.";
    const input = {
      tenantId: "test-tenant",
      currentSource: tradeGraph(),
      refreshedSource: refreshed,
      ownerLayer: ownerLayer(),
      manifest: manifestWith([
        binding("home:Contact:0", { objectField: "object:biz-trade" }),
      ]),
    };
    const first = JSON.stringify(refreshSource(input));
    const second = JSON.stringify(refreshSource(input));
    expect(second).toBe(first);
  });
});
