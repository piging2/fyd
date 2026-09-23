/**
 * BindingVerifier: the projection-seam gate fails closed.
 *
 * Covers the required cases:
 *  (a) a spec fragment whose every factual binding resolves -> all BOUND;
 *  (b) fabricated claims -> UNBOUND, and the claim is dropped (never
 *      published as fact);
 *  (c) owner-asserted values verify as BOUND only via a real owner
 *      assertion; a mere owner_authored label without an assertion, or a
 *      value that does not match the assertion, is UNBOUND;
 *  (d) determinism: same inputs twice -> identical verdicts.
 */
import {
  assertSpecBindingsVerified,
  BindingVerificationError,
  dropUnboundBindings,
  ownerAssertionsFromGraph,
  verifyBinding,
  verifySpecBindings,
  type OwnerAssertion,
} from "../binding-verifier";
import type { PresentationBinding } from "../graph";
import type { ObjectGraph } from "../types";
import type { PingObject } from "@/lib/ping/types";
import { makeObject, tradeGraph } from "../../builder/__tests__/fixtures";

const GRAPH = tradeGraph();

function bind(
  objectId: string,
  field: string,
  classification: PresentationBinding["classification"],
  extra?: Partial<PresentationBinding>,
): PresentationBinding {
  return { objectId, field, classification, ...(extra ?? {}) };
}

/**
 * A graph whose owner object carries a recorded owner correction for
 * "phone": fields[] holds the EFFECTIVE (owner-winning) value, exactly
 * as the read seam composes it.
 */
function graphWithOwnerCorrection(): ObjectGraph {
  const owner = GRAPH.objects.find((o) => o.id === "biz-trade");
  if (!owner) throw new Error("fixture has no owner object");
  const corrected: PingObject = {
    ...owner,
    fields: { ...owner.fields, phone: "555-0199" },
    ownerFieldCorrections: [
      {
        field: "phone",
        label: "Phone",
        sourceValue: "555-0100",
        ownerValue: "555-0199",
        correctedAt: "2026-09-20T00:00:00.000Z",
        actorLabel: "Demo Owner (seeded, unverified)",
        basis: "Owner correction: the owner says this is the main number.",
        sourceDrifted: false,
      },
    ],
  };
  return {
    objects: GRAPH.objects.map((o) => (o.id === "biz-trade" ? corrected : o)),
    relationships: GRAPH.relationships,
  };
}

describe("BindingVerifier", () => {
  describe("(a) fully bound spec fragment -> all BOUND", () => {
    const corrected = graphWithOwnerCorrection();
    const assertions = ownerAssertionsFromGraph(corrected);
    const bindings: PresentationBinding[] = [
      bind("biz-trade", "title", "direct"),
      bind("biz-trade", "phone", "direct"),
      bind("svc-drains", "description", "derived"),
      bind("biz-trade", "title", "generated", {
        generatorRef: "tagline-writer@1",
      }),
      bind("biz-trade", "phone", "owner_authored"),
    ];

    test("every factual binding resolves to a named source", () => {
      const report = verifySpecBindings(bindings, corrected, assertions);
      expect(report.allBound).toBe(true);
      expect(report.verdicts).toHaveLength(5);
      expect(report.unbound).toHaveLength(0);
      const sources = report.bound.map((v) => v.source).sort();
      expect(sources).toEqual([
        "evidence-ref",
        "evidence-ref",
        "generated-presentation",
        "object-field",
        "owner-assertion",
      ]);
      for (const v of report.bound) {
        expect(v.value).not.toBe("");
      }
    });

    test("owner assertions are derived from the graph corrections", () => {
      const found = assertions.find(
        (a: OwnerAssertion) => a.objectId === "biz-trade" && a.field === "phone",
      );
      expect(found).toBeDefined();
      expect(found && found.value).toBe("555-0199");
    });

    test("the emission gate passes a fully bound fragment", () => {
      expect(() =>
        assertSpecBindingsVerified(bindings, corrected, assertions),
      ).not.toThrow();
    });
  });

  describe("(b) fabricated claims -> UNBOUND and dropped, never published", () => {
    const ghost = makeObject("ghost-biz", "ping.social.business@1", {
      title: "Ghost Co",
      provenance: { kind: "website-derived", ref: "", derivedAt: "2026-09-21T00:00:00.000Z" },
    });
    const graph: ObjectGraph = {
      objects: [...GRAPH.objects, ghost],
      relationships: GRAPH.relationships,
    };
    const assertions = ownerAssertionsFromGraph(graph);

    const fabricated: PresentationBinding[] = [
      bind("biz-trade", "founded", "direct"), // no such field on the object
      bind("does-not-exist", "title", "direct"), // no such object
      bind("ghost-biz", "title", "direct"), // direct claim, empty evidence ref
      bind("biz-trade", "phone", "owner_authored"), // label, no assertion recorded
      bind("biz-trade", "title", "generated"), // generated without a generator mark
    ];

    test("each fabrication fails closed with a named reason", () => {
      const reasons = fabricated.map(
        (b) => verifyBinding(b, graph, assertions),
      );
      expect(reasons.every((v) => v.status === "UNBOUND")).toBe(true);
      const byReason = new Map(
        fabricated.map((b, i) => [
          b.objectId + "#" + b.field,
          (reasons[i] as { reason: string }).reason,
        ]),
      );
      expect(byReason.get("biz-trade#founded")).toBe("unbound field");
      expect(byReason.get("does-not-exist#title")).toBe("unknown object");
      expect(byReason.get("ghost-biz#title")).toBe("no evidence ref");
      expect(byReason.get("biz-trade#phone")).toBe("no owner assertion");
      expect(byReason.get("biz-trade#title")).toBe("no generator ref");
    });

    test("a mixed fragment reports UNBOUND without discarding the bound ones", () => {
      const mixed: PresentationBinding[] = [
        bind("biz-trade", "title", "direct"),
        ...fabricated,
      ];
      const report = verifySpecBindings(mixed, graph, assertions);
      expect(report.allBound).toBe(false);
      expect(report.bound).toHaveLength(1);
      expect(report.unbound).toHaveLength(5);
      expect(report.verdicts).toHaveLength(6);
    });

    test("the emission gate throws: no spec is produced", () => {
      expect(() =>
        assertSpecBindingsVerified(fabricated, graph, assertions),
      ).toThrow(BindingVerificationError);
      try {
        assertSpecBindingsVerified(fabricated, graph, assertions);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(BindingVerificationError);
        const err = e as BindingVerificationError;
        expect(err.report.allBound).toBe(false);
        expect(err.report.unbound).toHaveLength(5);
      }
    });

    test("dropUnboundBindings removes the fabricated claims", () => {
      const mixed: PresentationBinding[] = [
        bind("biz-trade", "title", "direct"),
        ...fabricated,
      ];
      const report = verifySpecBindings(mixed, graph, assertions);
      const kept = dropUnboundBindings(mixed, report);
      expect(kept).toHaveLength(1);
      expect(kept[0]).toBe(mixed[0]);
      // The fabricated bindings are gone: nothing unbound survives to publish.
      const recheck = verifySpecBindings(kept, graph, assertions);
      expect(recheck.allBound).toBe(true);
    });
  });

  describe("(c) owner assertion semantics", () => {
    test("a matching assertion verifies as BOUND via owner-assertion", () => {
      const corrected = graphWithOwnerCorrection();
      const verdict = verifyBinding(
        bind("biz-trade", "phone", "owner_authored"),
        corrected,
        ownerAssertionsFromGraph(corrected),
      );
      expect(verdict.status).toBe("BOUND");
      if (verdict.status === "BOUND") {
        expect(verdict.source).toBe("owner-assertion");
        expect(verdict.value).toBe("555-0199");
      }
    });

    test("assertion value must equal the presented value: mismatch is UNBOUND", () => {
      // The assertion attests 555-0199 but the presented (effective) value
      // drifted back to the source value: the owner assertion no longer
      // covers what is shown.
      const corrected = graphWithOwnerCorrection();
      const drifted: ObjectGraph = {
        objects: corrected.objects.map((o) =>
          o.id === "biz-trade"
            ? { ...o, fields: { ...o.fields, phone: "555-0100" } }
            : o,
        ),
        relationships: corrected.relationships,
      };
      const verdict = verifyBinding(
        bind("biz-trade", "phone", "owner_authored"),
        drifted,
        ownerAssertionsFromGraph(drifted),
      );
      expect(verdict.status).toBe("UNBOUND");
      if (verdict.status === "UNBOUND") {
        expect(verdict.reason).toBe("no owner assertion");
      }
    });

    test("assertion for another field does not cover this binding", () => {
      const corrected = graphWithOwnerCorrection();
      const verdict = verifyBinding(
        bind("biz-trade", "website", "owner_authored"),
        corrected,
        ownerAssertionsFromGraph(corrected),
      );
      expect(verdict.status).toBe("UNBOUND");
    });
  });

  describe("(d) determinism", () => {
    const corrected = graphWithOwnerCorrection();
    const bindings: PresentationBinding[] = [
      bind("biz-trade", "title", "direct"),
      bind("svc-drains", "description", "derived"),
      bind("biz-trade", "title", "generated", {
        generatorRef: "tagline-writer@1",
      }),
      bind("biz-trade", "phone", "owner_authored"),
    ];

    test("same inputs twice -> identical verdicts", () => {
      const assertions = ownerAssertionsFromGraph(corrected);
      const first = verifySpecBindings(bindings, corrected, assertions);
      const second = verifySpecBindings(bindings, corrected, assertions);
      expect(JSON.stringify(second.verdicts)).toBe(
        JSON.stringify(first.verdicts),
      );
    });

    test("assertion input order does not change verdicts", () => {
      const assertions = ownerAssertionsFromGraph(corrected);
      const shuffled = [...assertions].reverse();
      const a = verifySpecBindings(bindings, corrected, assertions);
      const b = verifySpecBindings(bindings, corrected, shuffled);
      expect(JSON.stringify(b.verdicts)).toBe(JSON.stringify(a.verdicts));
    });
  });
});
