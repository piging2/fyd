/**
 * Verified Render Model: the binding verifier's emission at the truth
 * boundary (EVIDENCE GRAPH -> BINDING VERIFIER -> VERIFIED RENDER MODEL
 * -> SITE SPEC / RENDERER).
 *
 * Covers the 24-hour builder decisions delta:
 *  - render-atom vocabulary is exactly OWNER_ASSERTED / DIRECT_EVIDENCE /
 *    DETERMINISTIC_DERIVATION / GENERATED_PRESENTATION / UNKNOWN;
 *  - every factual atom carries VALUE + CLASSIFICATION + EVIDENCE_REF or
 *    OWNER_ASSERTION_REF;
 *  - generated factual atoms must bind to evidence;
 *  - unsupported factual atoms fail closed (never published);
 *  - committed semantic-determinism regression: same ObjectGraph +
 *    bindings (spec fragment) + OwnerAssertions + ViewerContext + renderer
 *    version -> same semantic render model. Wall-clock time, random ids,
 *    and input ordering must not affect semantic output. Generated
 *    timestamps stay outside the semantic digest.
 */
import {
  BindingVerificationError,
  buildVerifiedRenderModel,
  classifyRenderAtom,
  ownerAssertionRefFor,
  ownerAssertionsFromGraph,
  VERIFIED_RENDER_MODEL_VERSION,
  type RenderAtom,
  type VerifiedRenderModel,
} from "../binding-verifier";
import type { PresentationBinding } from "../graph";
import type { ObjectGraph } from "../types";
import type { PingObject } from "@/lib/ping/types";
import { makeObject, tradeGraph } from "../../builder/__tests__/fixtures";

const GRAPH = tradeGraph();
const RENDERER_VERSION = "test-renderer@1";

function bind(
  objectId: string,
  field: string,
  classification: PresentationBinding["classification"],
  extra?: Partial<PresentationBinding>,
): PresentationBinding {
  return { objectId, field, classification, ...(extra ?? {}) };
}

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

function fullBindingSet(): PresentationBinding[] {
  return [
    bind("biz-trade", "title", "direct"),
    bind("biz-trade", "phone", "direct"),
    bind("svc-drains", "description", "derived"),
    bind("biz-trade", "title", "generated", {
      generatorRef: "tagline-writer@1",
    }),
    bind("biz-trade", "phone", "owner_authored"),
  ];
}

describe("verified render model", () => {
  describe("render-atom vocabulary and shape", () => {
    const corrected = graphWithOwnerCorrection();
    const assertions = ownerAssertionsFromGraph(corrected);

    test("binding classifications map to the exact render-atom vocabulary", () => {
      const byField = new Map(
        fullBindingSet().map((b) => [
          b.field + ":" + b.classification,
          classifyRenderAtom(b, corrected, assertions).classification,
        ]),
      );
      expect(byField.get("title:direct")).toBe("DIRECT_EVIDENCE");
      // LANE-CLAIM H3: phone carries an owner correction on this graph, so
      // the direct binding verifies through the owner-assertion path. The
      // owner's value is owner-attested, never laundered as source
      // evidence.
      expect(byField.get("phone:direct")).toBe("OWNER_ASSERTED");
      expect(byField.get("description:derived")).toBe(
        "DETERMINISTIC_DERIVATION",
      );
      expect(byField.get("title:generated")).toBe("GENERATED_PRESENTATION");
      expect(byField.get("phone:owner_authored")).toBe("OWNER_ASSERTED");
    });

    test("every factual atom carries value + classification + evidence or owner-assertion ref", () => {
      const model = buildVerifiedRenderModel(fullBindingSet(), corrected, assertions, {
        rendererVersion: RENDERER_VERSION,
      });
      expect(model.atoms.length).toBeGreaterThan(0);
      for (const atom of model.atoms) {
        expect(atom.value).not.toBe("");
        expect(atom.classification).not.toBe("UNKNOWN");
        const hasRef =
          (atom.evidenceRef ?? "") !== "" ||
          (atom.ownerAssertionRef ?? "") !== "";
        expect(hasRef).toBe(true);
        if (atom.classification === "OWNER_ASSERTED") {
          expect(atom.ownerAssertionRef).toBe(
            ownerAssertionRefFor({
              objectId: "biz-trade",
              field: "phone",
              value: "555-0199",
            }),
          );
        } else {
          expect(atom.evidenceRef).toBe(
            "website-ingestion:https://example.com/",
          );
        }
      }
    });

    test("model envelope carries version, renderer version, atoms, digest", () => {
      const model: VerifiedRenderModel = buildVerifiedRenderModel(
        fullBindingSet(),
        corrected,
        assertions,
        { rendererVersion: RENDERER_VERSION, viewerId: "viewer-1" },
      );
      expect(model.version).toBe(VERIFIED_RENDER_MODEL_VERSION);
      expect(model.rendererVersion).toBe(RENDERER_VERSION);
      expect(model.viewerId).toBe("viewer-1");
      // LANE-CLAIM H8: SHA-256 hex (64 chars), collision-resistant.
      expect(/^[0-9a-f]{64}$/.test(model.digest)).toBe(true);
      // Canonical order: atoms sorted by stable id.
      const ids = model.atoms.map((a: RenderAtom) => a.id);
      expect(ids).toEqual([...ids].sort());
    });

    test("generated factual atoms must bind to evidence: no evidence ref fails", () => {
      const ghost = makeObject("ghost-biz", "ping.social.business@1", {
        title: "Ghost Co",
        provenance: {
          kind: "website-derived",
          ref: "",
          derivedAt: "2026-09-21T00:00:00.000Z",
        },
      });
      const graph: ObjectGraph = {
        objects: [...GRAPH.objects, ghost],
        relationships: GRAPH.relationships,
      };
      const atom = classifyRenderAtom(
        bind("ghost-biz", "title", "generated", {
          generatorRef: "tagline-writer@1",
        }),
        graph,
        [],
      );
      expect(atom.classification).toBe("UNKNOWN");
      expect(atom.unknownReason).toBe("no evidence ref");
      expect(() =>
        buildVerifiedRenderModel(
          [bind("ghost-biz", "title", "generated", {
            generatorRef: "tagline-writer@1",
          })],
          graph,
          [],
          { rendererVersion: RENDERER_VERSION },
        ),
      ).toThrow(BindingVerificationError);
    });

    test("unsupported factual atoms fail closed: no model is produced", () => {
      const bindings: PresentationBinding[] = [
        bind("biz-trade", "title", "direct"),
        bind("biz-trade", "founded", "direct"), // fabricated
      ];
      const corrected = graphWithOwnerCorrection();
      expect(() =>
        buildVerifiedRenderModel(bindings, corrected, ownerAssertionsFromGraph(corrected), {
          rendererVersion: RENDERER_VERSION,
        }),
      ).toThrow(BindingVerificationError);
    });
  });

  describe("semantic determinism regression (committed)", () => {
    const corrected = graphWithOwnerCorrection();
    const bindings = fullBindingSet();

    function build(
      graph: ObjectGraph = corrected,
      list: readonly PresentationBinding[] = bindings,
      rendererVersion: string = RENDERER_VERSION,
      viewerId: string | null = null,
    ): VerifiedRenderModel {
      return buildVerifiedRenderModel(list, graph, ownerAssertionsFromGraph(graph), {
        rendererVersion,
        viewerId,
      });
    }

    test("same inputs twice -> identical model and digest", () => {
      const a = build();
      const b = build();
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(b.digest).toBe(a.digest);
    });

    test("graph object order does not affect the model", () => {
      const shuffled: ObjectGraph = {
        objects: [...corrected.objects].reverse(),
        relationships: [...corrected.relationships].reverse(),
      };
      expect(build(shuffled).digest).toBe(build().digest);
    });

    test("binding input order does not affect the model", () => {
      const shuffled = [...bindings].reverse();
      expect(build(corrected, shuffled).digest).toBe(build().digest);
    });

    test("owner assertion order does not affect the model", () => {
      const assertions = ownerAssertionsFromGraph(corrected);
      const reversed = [...assertions].reverse();
      const a = buildVerifiedRenderModel(bindings, corrected, assertions, {
        rendererVersion: RENDERER_VERSION,
      });
      const b = buildVerifiedRenderModel(bindings, corrected, reversed, {
        rendererVersion: RENDERER_VERSION,
      });
      expect(b.digest).toBe(a.digest);
    });

    test("unrelated random ids do not affect the model", () => {
      const extra = makeObject("random-" + Math.random().toString(36).slice(2), "ping.social.post@1", {
        title: "Unrelated post " + Math.random().toString(36).slice(2),
      });
      const withExtra: ObjectGraph = {
        objects: [...corrected.objects, extra],
        relationships: corrected.relationships,
      };
      expect(build(withExtra).digest).toBe(build().digest);
    });

    test("no timestamps enter the model or the digest", () => {
      const model = build();
      const canonical = JSON.stringify(model);
      expect(canonical).not.toContain("generatedAt");
      expect(canonical).not.toContain("asOf");
      expect((model as unknown as Record<string, unknown>).generatedAt).toBeUndefined();
      // Two builds at different wall-clock moments are identical: the
      // builder takes no clock input at all.
      expect(build().digest).toBe(model.digest);
    });

    test("duplicate bindings are deduplicated deterministically", () => {
      const doubled = [...bindings, ...bindings];
      expect(build(corrected, doubled).digest).toBe(build().digest);
      expect(build(corrected, doubled).atoms).toHaveLength(build().atoms.length);
    });

    test("a changed atom value changes the digest", () => {
      const base = build().digest;
      const altered: ObjectGraph = {
        objects: corrected.objects.map((o) =>
          o.id === "biz-trade" ? { ...o, title: o.title + " (updated)" } : o,
        ),
        relationships: corrected.relationships,
      };
      expect(build(altered).digest).not.toBe(base);
    });

    test("renderer version is part of the semantic identity", () => {
      expect(build(corrected, bindings, "test-renderer@2").digest).not.toBe(
        build().digest,
      );
    });

    test("viewer context is part of the semantic identity", () => {
      const a = build(corrected, bindings, RENDERER_VERSION, null);
      const b = build(corrected, bindings, RENDERER_VERSION, "viewer-9");
      expect(a.digest).not.toBe(b.digest);
      expect(build(corrected, bindings, RENDERER_VERSION, "viewer-9").digest).toBe(
        b.digest,
      );
    });
  });
});
