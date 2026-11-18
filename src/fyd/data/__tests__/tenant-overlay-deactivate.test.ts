/**
 * Regression: deactivating an object withdraws its evidence
 * relationships in the same op. The seed-shaped sequence (add a
 * public service, link it with an offers relationship, deactivate
 * the service) previously left an active relationship into a
 * now-private object, and the graph verifier fails closed on such
 * a leg (the /build/happy-place 500, 2026-11-18). The verifier is
 * not relaxed; the materialized graph must satisfy it.
 */
import { applyTenantOverlays } from "@/fyd/data/fyd-tenant-graph";
import { verifyObjectGraph } from "@/fyd/builder/object-builder";
import type { ObjectGraph } from "@/fyd/object/types";
import type { PingProjection } from "@/fyd/data/ping-object-source";

const baseGraph = (): ObjectGraph =>
  ({
    objects: [
      {
        id: "biz-1",
        schema: "ping.social.business@1",
        controllerId: "identity_fyd_demo_operator",
        visibility: "public",
        title: "Happy Place",
        fields: {},
        createdAt: "2026-09-19T18:00:00.000Z",
        updatedAt: "2026-09-19T18:00:00.000Z",
        provenance: { kind: "canonical-journal", ref: "ping-event:seed", derivedAt: "2026-09-19T18:00:00.000Z", updatedRefs: [] },
      },
    ],
    relationships: [],
  }) as unknown as ObjectGraph;

describe("deactivate_object overlay semantics", () => {
  it("withdraws the deactivated object's relationships and verifies clean", () => {
    const graph = baseGraph();
    applyTenantOverlays(graph, [
      {
        eventId: "ovl-001",
        ops: [
          {
            op: "add_object",
            object: {
              id: "svc-1",
              schema: "ping.social.service@1",
              controllerId: "identity_fyd_demo_operator",
              visibility: "public",
              title: "Pergola Design Consultations",
              fields: {},
              createdAt: "2026-09-19T18:30:59.221Z",
              updatedAt: "2026-09-19T18:30:59.221Z",
            },
          },
        ],
      },
      {
        eventId: "ovl-002",
        ops: [
          {
            op: "add_relationship",
            relationship: {
              id: "rel-1",
              subject: "biz-1",
              predicate: "offers",
              object: "svc-1",
              status: "active",
              createdAt: "2026-09-19T18:32:14.908Z",
            },
          },
        ],
      },
      { eventId: "ovl-007", ops: [{ op: "deactivate_object", objectId: "svc-1" }] },
    ] as never);

    const svc = graph.objects.find((o) => o.id === "svc-1");
    expect(svc?.visibility).toBe("private");
    expect(graph.relationships).toHaveLength(0);

    const projection = {
      graph,
      meta: { siteId: "happy-place" },
      ownerOverlay: null,
      presentationIntent: null,
    } as unknown as PingProjection;
    expect(() =>
      verifyObjectGraph({ tenantId: "happy-place" }, projection),
    ).not.toThrow();
  });

  it("keeps relationships that do not touch the deactivated object", () => {
    const graph = baseGraph();
    (graph.objects as unknown[]).push({
      id: "svc-2",
      schema: "ping.social.service@1",
      controllerId: "identity_fyd_demo_operator",
      visibility: "public",
      title: "Fences",
      fields: {},
      createdAt: "2026-09-19T18:00:00.000Z",
      updatedAt: "2026-09-19T18:00:00.000Z",
      provenance: { kind: "canonical-journal", ref: "ping-event:seed", derivedAt: "2026-09-19T18:00:00.000Z", updatedRefs: [] },
    });
    (graph.relationships as unknown[]).push({
      id: "rel-keep",
      subject: "biz-1",
      predicate: "offers",
      object: "svc-2",
      status: "active",
      createdAt: "2026-09-19T18:00:00.000Z",
    });
    applyTenantOverlays(graph, [
      {
        eventId: "ovl-008",
        ops: [
          {
            op: "add_object",
            object: {
              id: "svc-3",
              schema: "ping.social.service@1",
              controllerId: "identity_fyd_demo_operator",
              visibility: "public",
              title: "Decks",
              fields: {},
              createdAt: "2026-09-19T18:05:00.000Z",
              updatedAt: "2026-09-19T18:05:00.000Z",
            },
          },
        ],
      },
      { eventId: "ovl-009", ops: [{ op: "deactivate_object", objectId: "svc-3" }] },
    ] as never);
    // svc-3 deactivated (it had no relationships); the relationship
    // between biz-1 and the still-public svc-2 is untouched.
    expect(graph.relationships).toHaveLength(1);
    expect(graph.relationships[0].id).toBe("rel-keep");
  });
});
