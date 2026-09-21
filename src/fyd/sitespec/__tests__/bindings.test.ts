/**
 * verifyPresentationBinding: the projection-seam verifier fails closed.
 *
 * Traces one real value from the machine-generated Coppersmith fixture
 * (visible value -> object field -> claim -> evidence ref), then injects
 * four failure cases. Every failed binding must resolve to undefined so
 * the caller omits the value instead of rendering an unverified claim.
 */

import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import {
  resolveBoundField,
  verifyPresentationBinding,
  type PresentationBinding,
} from "../graph";

function findLocationObject() {
  const obj = COPPERSMITH_GRAPH.objects.find((o) => o.schema.includes("location"));
  if (!obj) throw new Error("fixture has no location object");
  return obj;
}

/** First non-empty field whose key contains "address" (case-insensitive); value is never hardcoded. */
function findAddressField(obj: ReturnType<typeof findLocationObject>): string {
  const key = Object.keys(obj.fields).find(
    (k) =>
      k.toLowerCase().includes("address") &&
      typeof obj.fields[k] === "string" &&
      (obj.fields[k] as string) !== ""
  );
  if (!key) throw new Error("location object has no non-empty address field");
  return key;
}

describe("verifyPresentationBinding", () => {
  test("traces a real location value: value -> object field -> evidence ref", () => {
    const location = findLocationObject();
    const field = findAddressField(location);
    const binding: PresentationBinding = {
      objectId: location.id,
      field,
      classification: "direct",
    };
    // The evidence hop: a direct claim must be linked to accepted evidence.
    expect(location.provenance.ref).not.toBe("");
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.value).toBe(location.fields[field]);
    }
    expect(resolveBoundField(COPPERSMITH_GRAPH, binding)).toBe(location.fields[field]);
  });

  test("fails closed: unknown object id", () => {
    const binding: PresentationBinding = {
      objectId: "does-not-exist-xyz",
      field: "locality",
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("unknown object");
    expect(resolveBoundField(COPPERSMITH_GRAPH, binding)).toBeUndefined();
  });

  test("fails closed: field name not present on the object", () => {
    const location = findLocationObject();
    const binding: PresentationBinding = {
      objectId: location.id,
      field: "no_such_field_xyz",
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("unbound field");
    expect(resolveBoundField(COPPERSMITH_GRAPH, binding)).toBeUndefined();
  });

  test("fails closed: direct claim with an empty evidence ref", () => {
    const location = findLocationObject();
    const field = findAddressField(location);
    const tampered = { ...location, provenance: { ...location.provenance, ref: "" } };
    const graph = {
      ...COPPERSMITH_GRAPH,
      objects: COPPERSMITH_GRAPH.objects.map((o) => (o.id === location.id ? tampered : o)),
    };
    const binding: PresentationBinding = {
      objectId: location.id,
      field,
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, graph);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no evidence ref");
    expect(resolveBoundField(graph, binding)).toBeUndefined();
  });

  test("fails closed: generated claim without a generatorRef", () => {
    const location = findLocationObject();
    const field = findAddressField(location);
    const binding: PresentationBinding = {
      objectId: location.id,
      field,
      classification: "generated",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no generator ref");
    expect(resolveBoundField(COPPERSMITH_GRAPH, binding)).toBeUndefined();
  });

  test("passes: generated claim with a name@version generatorRef", () => {
    const location = findLocationObject();
    const field = findAddressField(location);
    const binding: PresentationBinding = {
      objectId: location.id,
      field,
      classification: "generated",
      generatorRef: "copywriter@2.1",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(true);
  });

  test("passes: derived and owner_authored claims of present evidence", () => {
    const location = findLocationObject();
    const field = findAddressField(location);
    for (const classification of ["derived", "owner_authored"] as const) {
      const binding: PresentationBinding = { objectId: location.id, field, classification };
      expect(verifyPresentationBinding(binding, COPPERSMITH_GRAPH).ok).toBe(true);
    }
  });

  test("passes: title binds as an object-level factual identity field", () => {
    const location = findLocationObject();
    const binding: PresentationBinding = {
      objectId: location.id,
      field: "title",
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.value).toBe(location.title);
    expect(resolveBoundField(COPPERSMITH_GRAPH, binding)).toBe(location.title);
  });

  test("passes: description binds as an object-level factual identity field", () => {
    const location = findLocationObject();
    const binding: PresentationBinding = {
      objectId: location.id,
      field: "description",
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, COPPERSMITH_GRAPH);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.value).toBe(location.description);
  });

  test("fails closed: title without object provenance ref", () => {
    const location = findLocationObject();
    const stripped = {
      objects: COPPERSMITH_GRAPH.objects.map((o) =>
        o.id === location.id ? { ...o, provenance: { ...o.provenance, ref: "" } } : o,
      ),
      relationships: COPPERSMITH_GRAPH.relationships,
    };
    const binding: PresentationBinding = {
      objectId: location.id,
      field: "title",
      classification: "direct",
    };
    const verdict = verifyPresentationBinding(binding, stripped);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("no evidence ref");
    expect(resolveBoundField(stripped, binding)).toBeUndefined();
  });
});
