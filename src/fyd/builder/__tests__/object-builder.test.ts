/**
 * Object-builder boundary: tenant attestation, schema catalog, evidence
 * references, visibility, and relationship legality.
 */
import {
  proposeObjectDelta,
  verifyObjectGraph,
} from "../object-builder";
import { makeObject, makeRelationship, tradeGraph } from "./fixtures";
import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingProjection } from "@/fyd/data/ping-object-source";

const CTX = { tenantId: "trade-tenant" };

/** Wrap a fixture graph as the projection the verifier consumes. */
function proj(graph: ObjectGraph, siteId: string): PingProjection {
  return { graph, meta: { siteId } } as unknown as PingProjection;
}

function emptyGraph(): ObjectGraph {
  return { objects: [], relationships: [] };
}

describe("verifyObjectGraph", () => {
  test("a clean graph verifies and is attested", () => {
    const v = verifyObjectGraph(CTX, proj(tradeGraph(), "trade-tenant"));
    expect(v.attestation.tenantId).toBe("trade-tenant");
    expect(v.attestation.builderVersion).toBe("fyd-object-builder@1");
    expect(v.attestation.schemaCatalogVersion).toBe("fyd-schema-catalog@1");
    expect(v.attestation.objectCount).toBe(7);
    expect(v.attestation.relationshipCount).toBe(6);
    expect(v.attestation.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(v.attestation.checks).toContain("tenant-attestation");
    expect(v.graph).toBeDefined();
  });

  test("attestation digest is deterministic", () => {
    const a = verifyObjectGraph(CTX, proj(tradeGraph(), "trade-tenant"));
    const b = verifyObjectGraph(CTX, proj(tradeGraph(), "trade-tenant"));
    expect(a.attestation.digest).toBe(b.attestation.digest);
  });

  test("missing tenant context refuses", () => {
    expect(() => verifyObjectGraph({} as never, proj(tradeGraph(), "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "TENANT_CONTEXT_MISSING" }),
    );
  });

  test("cross-tenant projection is refused before any graph byte is trusted", () => {
    expect(() =>
      verifyObjectGraph(CTX, proj(tradeGraph(), "other-tenant")),
    ).toThrow(expect.objectContaining({ code: "CROSS_TENANT_REFERENCE" }));
  });

  test("duplicate object IDs fail", () => {
    const g = tradeGraph();
    const dup = { ...g, objects: [...g.objects, makeObject("biz-trade", "ping.social.business@1")] };
    expect(() => verifyObjectGraph(CTX, proj(dup, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_ID" }),
    );
  });

  test("unknown schema fails", () => {
    const g = tradeGraph();
    const bad = {
      ...g,
      objects: [...g.objects, makeObject("x-1", "ping.social.evil@9")],
    };
    expect(() => verifyObjectGraph(CTX, proj(bad, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_SCHEMA" }),
    );
  });

  test("object without a provenance ref fails", () => {
    const g = tradeGraph();
    const noProv = {
      ...g,
      objects: [...g.objects, { ...makeObject("x-1", "ping.social.service@1"), provenance: undefined as never }],
    };
    expect(() => verifyObjectGraph(CTX, proj(noProv, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_EVIDENCE" }),
    );
  });

  test("evidence ref on an unknown object fails", () => {
    const g = tradeGraph();
    const bad = { ...g, relationships: [...g.relationships, makeRelationship("rx", "biz-trade", "provides", "ghost")] };
    expect(() => verifyObjectGraph(CTX, proj(bad, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_RELATIONSHIP" }),
    );
  });

  test("illegal predicate fails", () => {
    const g = tradeGraph();
    const bad = {
      ...g,
      relationships: [...g.relationships, makeRelationship("rx", "biz-trade", "owns_the_world", "svc-drains")],
    };
    expect(() => verifyObjectGraph(CTX, proj(bad, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_RELATIONSHIP" }),
    );
  });

  test("private object used as public evidence fails closed", () => {
    const priv: PingObject = makeObject("svc-secret", "ping.social.service@1", {
      visibility: "private",
      title: "Secret service",
    });
    const g: ObjectGraph = {
      objects: [...tradeGraph().objects, priv],
      relationships: [
        ...tradeGraph().relationships,
        makeRelationship("rx", "biz-trade", "provides", "svc-secret"),
      ],
    };
    expect(() => verifyObjectGraph(CTX, proj(g, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_VISIBILITY" }),
    );
  });

  test("bad visibility value fails", () => {
    const bad: PingObject = makeObject("x-1", "ping.social.service@1", {
      visibility: "secret" as never,
      title: "X",
    });
    expect(() => verifyObjectGraph(CTX, proj({ objects: [bad], relationships: [] }, "trade-tenant"))).toThrow(
      expect.objectContaining({ code: "OBJECT_BUILDER_VISIBILITY" }),
    );
  });

  test("a purely private graph verifies: privacy is a fact, not an error", () => {
    const priv: PingObject = makeObject("x-1", "ping.social.service@1", {
      visibility: "private",
      title: "X",
    });
    const v = verifyObjectGraph(CTX, proj({ objects: [priv], relationships: [] }, "trade-tenant"));
    expect(v.attestation.objectCount).toBe(1);
  });

  test("the proposed delta is empty: no synthetic observations", () => {
    const d = proposeObjectDelta(CTX, proj(emptyGraph(), "trade-tenant"));
    expect(d.tenantId).toBe("trade-tenant");
    expect(d.upserts).toEqual([]);
    expect(d.relationshipUpserts).toEqual([]);
    expect(d.findings).toEqual([]);
  });
});
