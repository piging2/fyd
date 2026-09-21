/**
 * FYD owner address visibility override: the gate.
 *
 * Source contains an address, FYD has a conservative default, the owner
 * chooses SHOW/HIDE/COARSE, regenerate, the decision survives re-ingestion.
 * Pure, deterministic; no network, no filesystem.
 */

import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";
import type { ObjectGraph } from "../types";
import {
  applyFieldVisibility,
  coarsenAddress,
  resolveFieldVisibility,
} from "../field-visibility";
import type { FieldVisibilityDecision } from "../field-visibility";

const DECIDED_AT = "2026-09-21T13:50:00Z";

interface AddressTarget {
  objectId: string;
  field: string;
  sourceValue: string;
}

/**
 * Loud failure if the fixture ever stops carrying an address on a
 * location object: the gate cannot be proven silently.
 */
function findAddressTarget(graph: ObjectGraph): AddressTarget {
  const location = graph.objects.find((o) =>
    o.schema.toLowerCase().includes("location"),
  );
  if (!location) {
    throw new Error(
      "FAIL: COPPERSMITH_GRAPH has no location object (schema containing 'location'); the address gate cannot be proven.",
    );
  }
  const field = Object.keys(location.fields).find((k) =>
    k.toLowerCase().includes("address"),
  );
  if (!field) {
    throw new Error(
      `FAIL: location object ${location.id} has no address field (key containing 'address'); the address gate cannot be proven.`,
    );
  }
  const value = location.fields[field];
  const sourceValue = Array.isArray(value) ? value.join(", ") : value;
  return { objectId: location.id, field, sourceValue };
}

function decision(
  target: AddressTarget,
  policy: FieldVisibilityDecision["policy"],
  version = 1,
): FieldVisibilityDecision {
  return {
    objectId: target.objectId,
    field: target.field,
    policy,
    decidedBy: "owner",
    decidedAt: DECIDED_AT,
    source: "owner_override",
    version,
  };
}

function projectedObject(graph: ObjectGraph, objectId: string) {
  const o = graph.objects.find((x) => x.id === objectId);
  if (!o) throw new Error(`FAIL: object ${objectId} missing from projected graph`);
  return o;
}

describe("coarsenAddress", () => {
  test("drops the street segment, keeps the last two", () => {
    expect(coarsenAddress("123 Main St, Grand Junction, CO 81501")).toBe(
      "Grand Junction, CO 81501",
    );
  });

  test("fewer than two segments returns the value unchanged", () => {
    expect(coarsenAddress("Grand Junction")).toBe("Grand Junction");
    expect(coarsenAddress("")).toBe("");
  });
});

describe("owner address visibility override (address gate)", () => {
  const target = findAddressTarget(COPPERSMITH_GRAPH);

  test("fixture carries a location object with an address field", () => {
    expect(target.objectId).toContain("location");
    expect(target.field.toLowerCase()).toContain("address");
    expect(target.sourceValue.length).toBeGreaterThan(0);
  });

  test("conservative default: address fields coarsen, everything else shows", () => {
    expect(resolveFieldVisibility(target.objectId, target.field, [])).toEqual({
      policy: "coarse",
      source: "conservative_default",
    });
    expect(resolveFieldVisibility(target.objectId, "phone", [])).toEqual({
      policy: "show",
      source: "conservative_default",
    });
  });

  test("apply with no decisions coarsens the address and leaves the source untouched", () => {
    const projected = applyFieldVisibility(COPPERSMITH_GRAPH, []);
    const obj = projectedObject(projected, target.objectId);
    expect(obj.fields[target.field]).toBe(coarsenAddress(target.sourceValue));
    // Source state is not overwritten: the fixture object keeps the full value.
    const sourceObj = projectedObject(COPPERSMITH_GRAPH, target.objectId);
    expect(sourceObj.fields[target.field]).toBe(target.sourceValue);
    // A new graph record; only fields records were rebuilt.
    expect(projected).not.toBe(COPPERSMITH_GRAPH);
    expect(projected.relationships).toBe(COPPERSMITH_GRAPH.relationships);
  });

  test("owner SHOW: full discovered address present, source owner_override", () => {
    const show = decision(target, "show");
    expect(resolveFieldVisibility(target.objectId, target.field, [show])).toEqual({
      policy: "show",
      source: "owner_override",
    });
    const projected = applyFieldVisibility(COPPERSMITH_GRAPH, [show]);
    expect(projectedObject(projected, target.objectId).fields[target.field]).toBe(
      target.sourceValue,
    );
  });

  test("owner HIDE: field absent from the projected object, siblings survive", () => {
    const projected = applyFieldVisibility(COPPERSMITH_GRAPH, [
      decision(target, "hide"),
    ]);
    const obj = projectedObject(projected, target.objectId);
    expect(target.field in obj.fields).toBe(false);
    expect(Object.keys(obj.fields).length).toBeGreaterThan(0);
  });

  test("highest version wins among owner decisions for the same object+field", () => {
    const hide1 = decision(target, "hide", 1);
    const show2 = decision(target, "show", 2);
    expect(
      resolveFieldVisibility(target.objectId, target.field, [hide1, show2]),
    ).toEqual({ policy: "show", source: "owner_override" });
    expect(
      resolveFieldVisibility(target.objectId, target.field, [show2, hide1]),
    ).toEqual({ policy: "show", source: "owner_override" });
  });

  test("decision survives re-ingestion: clean re-ingest defaults coarse again, reapplied SHOW restores the full address", () => {
    // Simulate a clean re-ingest: fresh SOURCE STATE with no owner state in it.
    const reingested: ObjectGraph = JSON.parse(JSON.stringify(COPPERSMITH_GRAPH));
    expect(resolveFieldVisibility(target.objectId, target.field, [])).toEqual({
      policy: "coarse",
      source: "conservative_default",
    });
    // The SAME owner decisions, stored outside the graph, re-applied.
    const projected = applyFieldVisibility(reingested, [decision(target, "show")]);
    expect(projectedObject(projected, target.objectId).fields[target.field]).toBe(
      target.sourceValue,
    );
    // And HIDE still hides after re-ingest.
    const hidden = applyFieldVisibility(reingested, [decision(target, "hide")]);
    expect(target.field in projectedObject(hidden, target.objectId).fields).toBe(
      false,
    );
  });

  test("deterministic: applying twice yields JSON-identical output", () => {
    const decisions = [decision(target, "show")];
    const once = applyFieldVisibility(COPPERSMITH_GRAPH, decisions);
    const twice = applyFieldVisibility(COPPERSMITH_GRAPH, decisions);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
