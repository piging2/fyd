/**
 * Regression: an owner object updated by overlays (provenance
 * updatedRefs non-empty) must still plan. The generated hero slot
 * cites the object's CURRENT evidence ref (the latest update ref),
 * which is what both the presentation gate and the binding
 * verifier's LANE-CLAIM D1 rule require. Before the repair the
 * slot cited the superseded base provenance ref: the presentation
 * gate demanded exactly that ref while the atom classifier
 * refused it as superseded, so planSite threw
 * BindingVerificationError for every updated owner object (the
 * second layer of the /build/happy-place 500, 2026-11-18).
 */
import { planSite } from "../planner";
import { COPPERSMITH_VECTOR } from "../dimensions";
import { tradeGraph } from "./fixtures";
import { verifyGeneratedPresentation } from "../generated-presentation";
import type { GeneratedPresentation } from "../generated-presentation";

const CTX = { tenantId: "trade-tenant" };

describe("planner claim refs on updated owner objects", () => {
  it("plans an owner object with updatedRefs and cites the current ref", () => {
    const graph = tradeGraph();
    const owner = graph.objects.find((o) => o.id === "biz-trade")!;
    owner.provenance = {
      ...owner.provenance!,
      updatedRefs: ["ping-event:upd-1", "ping-event:upd-2"],
    };
    const planned = planSite({ ctx: CTX, graph, vector: COPPERSMITH_VECTOR });
    const slot = planned.generatedPresentation.slots[0];
    expect(slot).toBeDefined();
    expect(slot.bindings.length).toBeGreaterThan(0);
    for (const b of slot.bindings) {
      expect(b.claimRef).toBe("ping-event:upd-2");
    }
  });

  it("still refuses a slot pinned to the superseded base ref", () => {
    const graph = tradeGraph();
    const owner = graph.objects.find((o) => o.id === "biz-trade")!;
    owner.provenance = {
      ...owner.provenance!,
      updatedRefs: ["ping-event:upd-1"],
    };
    const gp: GeneratedPresentation = {
      version: 1,
      slots: [
        {
          slotId: "hero",
          sectionId: "home:Hero:0",
          text: owner.title + " -- " + String(owner.fields.locality),
          copyClass: "DIRECT_FACT",
          bindings: [
            { objectId: owner.id, field: "title", claimRef: owner.provenance!.ref },
            { objectId: owner.id, field: "locality", claimRef: owner.provenance!.ref },
          ],
        },
      ],
    };
    const result = verifyGeneratedPresentation(gp, graph, []);
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.code === "claim-mismatch")).toBe(true);
  });
});
