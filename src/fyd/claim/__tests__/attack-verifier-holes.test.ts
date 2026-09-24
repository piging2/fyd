/**
 * LANE-CLAIM attack tests: break the BindingVerifier or prove it.
 *
 * The invariant under attack: every FACTUAL rendered claim resolves to
 * DIRECT EVIDENCE, or a DERIVED CLAIM WITH INPUT EVIDENCE, or an OWNER
 * ASSERTION, or clearly identified GENERATED PRESENTATION. Decorative /
 * interface strings are out of scope.
 *
 * Each test below asserts the invariant and FAILS against the current
 * verifier where the invariant does not hold. A failing test here is the
 * deliverable: it names a genuine hole. Do not "fix" these tests by
 * weakening the assertions; fix the verifier (see
 * ~/workspace/fyd-factory/patches/ for proposals).
 *
 * Run:
 *   npx jest --transform '{"^.+\\.tsx?$":["ts-jest",{"isolatedModules":true}]}' \
 *     --moduleNameMapper '{"^@/(.*)$":"<rootDir>/src/$1"}' \
 *     src/fyd/claim/__tests__/attack-verifier-holes.test.ts
 */
import {
  assertSpecBindingsVerified,
  BindingVerificationError,
  buildVerifiedRenderModel,
  classifyRenderAtom,
  ownerAssertionsFromGraph,
  verifyBinding,
} from "../../sitespec/binding-verifier";
import {
  resolveBoundField,
  type PresentationBinding,
} from "../../sitespec/graph";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import { makeObject, tradeGraph } from "../../builder/__tests__/fixtures";

const GRAPH = tradeGraph();
const TS = "2026-09-21T00:00:00.000Z";

/** An object with fields but no evidence at all (empty provenance ref). */
function unevidencedObject(): PingObject {
  return makeObject("ghost-biz", "ping.social.business@1", {
    title: "Ghost Co",
    fields: { yearsInBusiness: "47" },
    provenance: { kind: "website-derived", ref: "", derivedAt: TS },
  });
}

function graphWithGhost(): ObjectGraph {
  return {
    objects: [...GRAPH.objects, unevidencedObject()],
    relationships: GRAPH.relationships,
  };
}

/** The owner object with a recorded correction whose owner value differs
 *  from the source value; fields[] carries the EFFECTIVE (owner-winning)
 *  value, exactly as the read seam composes it. */
function graphWithOwnerCorrection(phoneValue = "555-0199"): ObjectGraph {
  const owner = GRAPH.objects.find((o) => o.id === "biz-trade");
  if (!owner) throw new Error("fixture has no owner object");
  const corrected: PingObject = {
    ...owner,
    fields: { ...owner.fields, phone: phoneValue },
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

describe("H1: derived claims require INPUT EVIDENCE (false negative)", () => {
  const graph = graphWithGhost();

  test("a derived claim with no evidence anywhere is UNBOUND", () => {
    const verdict = verifyBinding(
      {
        objectId: "ghost-biz",
        field: "yearsInBusiness",
        classification: "derived",
      },
      graph,
      [],
    );
    // INVARIANT: derived = DERIVED CLAIM WITH INPUT EVIDENCE. This object
    // has an empty provenance ref: there is no input evidence. Any label
    // can otherwise smuggle an unevidenced fact through as BOUND.
    expect(verdict.status).toBe("UNBOUND");
  });

  test("a DETERMINISTIC_DERIVATION atom always carries a non-empty evidence ref", () => {
    const atom = classifyRenderAtom(
      {
        objectId: "ghost-biz",
        field: "yearsInBusiness",
        classification: "derived",
      },
      graph,
      [],
    );
    // Contract stated in binding-verifier.ts: every factual render atom
    // carries VALUE + CLASSIFICATION + EVIDENCE_REF or OWNER_ASSERTION_REF.
    expect(atom.classification).toBe("DETERMINISTIC_DERIVATION");
    expect(atom.evidenceRef ?? "").not.toBe("");
  });
});

describe("H2: generated factual atoms must bind to evidence, in BOTH gates", () => {
  const graph = graphWithGhost();
  const binding: PresentationBinding = {
    objectId: "ghost-biz",
    field: "title",
    classification: "generated",
    generatorRef: "tagline-writer@1",
  };

  test("assertSpecBindingsVerified refuses generated atoms with no evidence ref", () => {
    // FYD-24H-BUILDER-DECISIONS-2026-09-22, quoted in binding-verifier.ts:
    // generated -> GENERATED_PRESENTATION requires a generator mark AND an
    // evidence ref. assertSpecBindingsVerified is documented as "the
    // emission gate" that "throws before any spec is produced".
    expect(() =>
      assertSpecBindingsVerified([binding], graph, []),
    ).toThrow(BindingVerificationError);
  });

  test("the two emission gates agree on the same binding", () => {
    let gateA: string;
    let gateB: string;
    try {
      assertSpecBindingsVerified([binding], graph, []);
      gateA = "pass";
    } catch {
      gateA = "throw";
    }
    try {
      buildVerifiedRenderModel([binding], graph, [], {
        rendererVersion: "attack@1",
      });
      gateB = "pass";
    } catch {
      gateB = "throw";
    }
    // Two exported emission gates that disagree on one binding mean the
    // guarantee depends on which gate the caller happened to pick.
    expect(gateA).toBe(gateB);
  });
});

describe("H3: owner-corrected values must not grade as direct evidence", () => {
  test("direct binding on an owner-overridden field is not evidence-ref", () => {
    const graph = graphWithOwnerCorrection();
    const verdict = verifyBinding(
      { objectId: "biz-trade", field: "phone", classification: "direct" },
      graph,
      ownerAssertionsFromGraph(graph),
    );
    // The presented value (555-0199) is the OWNER's; the provenance ref
    // covers the SOURCE value (555-0100). Grading the owner's value as
    // "evidence-ref" launders owner authorship as direct evidence.
    expect(verdict.status).toBe("BOUND");
    if (verdict.status === "BOUND") {
      expect(verdict.source).not.toBe("evidence-ref");
      expect(verdict.value).toBe("555-0199");
    }
  });
});

describe("H4: the render-path gate must enforce the owner-assertion rule", () => {
  test("owner_authored with no recorded assertion does not resolve for rendering", () => {
    // The BindingVerifier refuses this: the label alone is not enough.
    const verdict = verifyBinding(
      { objectId: "biz-trade", field: "phone", classification: "owner_authored" },
      GRAPH,
      [],
    );
    expect(verdict.status).toBe("UNBOUND");
    // resolveBoundField is what the renderer actually calls (renderer.tsx
    // boundField). It must agree with the BindingVerifier: a claim the
    // verifier refuses must not resolve for rendering.
    const rendered = resolveBoundField(GRAPH, {
      objectId: "biz-trade",
      field: "phone",
      classification: "owner_authored",
    });
    expect(rendered).toBeUndefined();
  });
});

describe("H5: per-field evidence is unrepresentable (two sources, one object)", () => {
  test("a binding's own evidenceRef is honored, not silently replaced", () => {
    const binding: PresentationBinding = {
      objectId: "biz-trade",
      field: "title",
      classification: "direct",
      // Field-level source B; the object's provenance is source A.
      evidenceRef: "google-business-profile:acme-123",
    };
    const atom = classifyRenderAtom(binding, GRAPH, []);
    // Silently substituting the object-level ref misattributes source B's
    // claim to source A. The verifier must honor the carrier or refuse.
    expect(atom.classification).toBe("DIRECT_EVIDENCE");
    expect(atom.evidenceRef).toBe("google-business-profile:acme-123");
  });
});

describe("H6: withdrawn evidence has no binding path", () => {
  test("a direct binding on a non-public object is UNBOUND", () => {
    const hidden: ObjectGraph = {
      objects: GRAPH.objects.map((o) =>
        o.id === "biz-trade" ? { ...o, visibility: "private" as const } : o,
      ),
      relationships: GRAPH.relationships,
    };
    const verdict = verifyBinding(
      { objectId: "biz-trade", field: "phone", classification: "direct" },
      hidden,
      [],
    );
    // The owner withdrew this object from public view after binding. The
    // verifier takes no visibility/withdrawal input and still grades BOUND.
    expect(verdict.status).toBe("UNBOUND");
  });
});

describe("H7: owner-assertion matching must survive trivial normalization", () => {
  test("a trailing space does not void a real owner assertion", () => {
    // Ingestion left a trailing space on the effective value; the owner
    // assertion attests "555-0199". The claim IS evidenced.
    const graph = graphWithOwnerCorrection("555-0199 ");
    const verdict = verifyBinding(
      { objectId: "biz-trade", field: "phone", classification: "owner_authored" },
      graph,
      ownerAssertionsFromGraph(graph),
    );
    // Byte-exact matching voids real evidence over a trailing space:
    // an evidenced claim the verifier cannot bind (false positive).
    expect(verdict.status).toBe("BOUND");
  });
});

describe("H9: the verifier grades the field value, not the presented claim", () => {
  test("a derived presentation's composed claim is what must verify", () => {
    // Adversarial case from the brief: "serving the valley since 2009"
    // computed from a founding date. The binding carries no transform and
    // no presented text; the verifier returns the RAW field value.
    const obj = makeObject("biz-derived", "ping.social.business@1", {
      title: "Acme Plumbing",
      fields: { foundingDate: "2009" },
    });
    const graph: ObjectGraph = { objects: [obj], relationships: [] };
    const verdict = verifyBinding(
      { objectId: "biz-derived", field: "foundingDate", classification: "derived" },
      graph,
      [],
    );
    expect(verdict.status).toBe("BOUND");
    if (verdict.status === "BOUND") {
      // The claim the user will read is "Serving the valley since 2009",
      // not "2009". The verifier never sees the composed claim, so the
      // digest and the atoms describe inputs, never rendered outputs.
      expect(verdict.value).toBe("Serving the valley since 2009");
    }
  });
});

describe("H8: the 32-bit digest is not a semantic identity", () => {  test("two different verified models can share one digest", () => {
    const seen = new Map<string, string>();
    let collision: { first: string; second: string; digest: string } | null =
      null;
    // Birthday bound for 32 bits: ~2^16 trials collide with ~39%;
    // 300k trials collide with >99.99%.
    for (let i = 0; i < 300000 && !collision; i++) {
      const obj = makeObject("biz-" + i, "ping.social.business@1", {
        title: "Acme " + i,
        fields: { phone: "555-" + String(1000 + i) },
      });
      const graph: ObjectGraph = { objects: [obj], relationships: [] };
      const model = buildVerifiedRenderModel(
        [{ objectId: obj.id, field: "phone", classification: "direct" }],
        graph,
        [],
        { rendererVersion: "attack@1" },
      );
      const value = model.atoms[0].value;
      const prev = seen.get(model.digest);
      if (prev !== undefined && prev !== value) {
        collision = { first: prev, second: value, digest: model.digest };
      } else if (prev === undefined) {
        seen.set(model.digest, value);
      }
    }
    // A semantic identity that collides on demand cannot back change
    // detection or dedup: distinct fact sets map to one digest.
    expect(collision).toBeNull();
  }, 120000);
});
