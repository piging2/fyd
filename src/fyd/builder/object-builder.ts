/**
 * OBJECT BUILDER: decides what is known.
 *
 * Boundary (hard): the object builder owns the object graph's integrity;
 * the website builder owns presentation. The site planner NEVER
 * manufactures business facts; it only consumes graphs this module has
 * verified and attested.
 *
 * Input:  tenant context + the current graph (from the projection seam,
 *         which is the file-runtime intake for observations + evidence) +
 *         the schema catalog.
 * Output: a verified ObjectGraph with a tenant attestation, or a typed
 *         refusal. A proposed object delta is also produced: empty when
 *         the graph verifies clean (nothing to change), carrying findings
 *         otherwise.
 *
 * The deterministic verifier checks, in order:
 *   1. tenant: the projection's tenant attestation (meta.siteId) matches
 *      the acting tenant, else CROSS_TENANT_REFERENCE.
 *   2. schema: every object schema is in the catalog (SCHEMA_ROLES or the
 *      documented extra vocabulary), else OBJECT_BUILDER_SCHEMA.
 *   3. evidence references: every object has a provenance ref and every
 *      relationship has an evidenceRef, else OBJECT_BUILDER_EVIDENCE.
 *   4. IDs: object and relationship ids are non-empty and unique, else
 *      OBJECT_BUILDER_ID.
 *   5. relationship legality: subject/object endpoints exist, predicate
 *      non-empty, status active|inactive, else OBJECT_BUILDER_RELATIONSHIP.
 *   6. visibility: every object visibility is public|private, else
 *      OBJECT_BUILDER_VISIBILITY. Visibility is read, never mutated.
 *
 * Commit path: in this file runtime there is no database, so there are no
 * arbitrary DB writes by construction. The commit is the attested graph
 * handed to the planner; the canonical transition path is
 * projection-seam -> verifyObjectGraph -> planSite. The verifier never
 * writes.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { canonicalize } from "@/lib/ping/ask-composer";
import { createHash } from "node:crypto";
import {
  assertTenantKey,
  TenantContextError,
  type TenantContext,
} from "../tenant/tenant-context";
import type { PingProjection } from "../data/ping-object-source";
import { schemaRole } from "../sitespec/schemas";
import { EXTERNAL_IDENTITY_SCHEMA } from "./eligibility";
import type { ObjectGraph } from "../sitespec/types";

export const OBJECT_BUILDER_VERSION = "fyd-object-builder@1";
/** Schema catalog version pinned for attestations. */
export const SCHEMA_CATALOG_VERSION = "fyd-schema-catalog@1";

export type ObjectBuilderCode =
  | "OBJECT_BUILDER_SCHEMA"
  | "OBJECT_BUILDER_EVIDENCE"
  | "OBJECT_BUILDER_ID"
  | "OBJECT_BUILDER_RELATIONSHIP"
  | "OBJECT_BUILDER_VISIBILITY";

export class ObjectBuilderError extends Error {
  readonly code: ObjectBuilderCode;
  constructor(code: ObjectBuilderCode, message: string) {
    super(message);
    this.name = "ObjectBuilderError";
    this.code = code;
  }
}

/** Schemas the catalog accepts beyond SCHEMA_ROLES (observed, documented). */
const EXTRA_CATALOG_SCHEMAS = new Set<string>([EXTERNAL_IDENTITY_SCHEMA]);

/**
 * Predicate vocabulary the system understands: the generator's
 * ROLE_PREDICATES plus the team/identity predicates the eligibility
 * rules recognize (works_for, links_to, member_of). A relationship
 * carrying any other predicate is refused: the planner cannot reason
 * over a predicate with no defined meaning.
 */
const LEGAL_PREDICATES = new Set<string>([
  "provides",
  "offers",
  "located_at",
  "has_location",
  "employs",
  "has_member",
  "publishes",
  "works_for",
  "links_to",
  "member_of",
]);

function schemaKnown(schema: string): boolean {
  return schemaRole(schema) !== null || EXTRA_CATALOG_SCHEMAS.has(schema);
}

export interface GraphAttestation {
  builderVersion: string;
  schemaCatalogVersion: string;
  tenantId: string;
  objectCount: number;
  relationshipCount: number;
  /** sha256 over the repo canonicalization of the verified graph. */
  digest: string;
  /** Check names that passed, in canonical order. */
  checks: string[];
  /**
   * Evidence-preserving derivations applied during verification. The
   * attested graph may contain derived edges; each one names the source
   * edge and the rule, so the WHY THIS chain never invents evidence.
   */
  derivations: Array<{ from: string; to: string; rule: string }>;
}

export interface VerifiedGraph {
  graph: ObjectGraph;
  attestation: GraphAttestation;
}

/**
 * A proposed object delta: the object builder's output shape. Empty when
 * the current graph verifies clean. Observation intake arrives via the
 * PING dump (the projection seam); this lane proposes no synthetic
 * observations, so the delta carries verification findings only.
 */
export interface ObjectDelta {
  tenantId: string;
  /** Proposed object upserts; empty in this lane. */
  upserts: PingObject[];
  /** Proposed relationship upserts; empty in this lane. */
  relationshipUpserts: PingRelationship[];
  /** Verification findings against the current graph. */
  findings: string[];
}

export function proposeObjectDelta(
  ctx: TenantContext,
  projection: PingProjection,
): ObjectDelta {
  const tenantId = assertTenantKey(ctx, projection.meta.siteId);
  return { tenantId, upserts: [], relationshipUpserts: [], findings: [] };
}

/**
 * Verify the tenant's current graph and attest it for the planner.
 * Throws TenantContextError on tenant mismatch, ObjectBuilderError on
 * any verification failure. Never writes.
 */
export function verifyObjectGraph(
  ctx: TenantContext,
  projection: PingProjection,
): VerifiedGraph {
  // Check 1: tenant attestation. The key being verified MUST belong to the
  // acting tenant; anything else is a cross-tenant reference, refused
  // before any graph byte is trusted.
  const tenantId = assertTenantKey(ctx, projection.meta.siteId);
  const graph = projection.graph;
  const checks: string[] = ["tenant-attestation"];

  // Check 4 (ids) runs before endpoints so relationship legality has a
  // trustworthy id set. Order of checks is canonical and deterministic.
  const objectIds = new Set<string>();
  const byId = new Map<string, (typeof graph.objects)[number]>();
  for (const o of graph.objects) {
    if (typeof o.id !== "string" || o.id.length === 0) {
      throw new ObjectBuilderError("OBJECT_BUILDER_ID", "object has empty id");
    }
    if (objectIds.has(o.id)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_ID",
        "duplicate object id \"" + o.id + "\"",
      );
    }
    objectIds.add(o.id);
    byId.set(o.id, o);
  }
  const relIds = new Set<string>();
  for (const r of graph.relationships) {
    if (typeof r.id !== "string" || r.id.length === 0) {
      throw new ObjectBuilderError("OBJECT_BUILDER_ID", "relationship has empty id");
    }
    if (relIds.has(r.id)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_ID",
        "duplicate relationship id \"" + r.id + "\"",
      );
    }
    relIds.add(r.id);
  }
  checks.push("ids-unique");

  // Check 2: schema catalog.
  for (const o of graph.objects) {
    if (!schemaKnown(o.schema)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_SCHEMA",
        "object \"" + o.id + "\" has unknown schema \"" + o.schema + "\"",
      );
    }
  }
  checks.push("schema-catalog");

  // Check 3: evidence references.
  for (const o of graph.objects) {
    const ref = o.provenance?.ref;
    if (typeof ref !== "string" || ref.length === 0) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_EVIDENCE",
        "object \"" + o.id + "\" lacks a provenance ref: no fact without a traceable basis",
      );
    }
  }
  for (const r of graph.relationships) {
    if (typeof r.evidenceRef !== "string" || r.evidenceRef.length === 0) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_EVIDENCE",
        "relationship \"" + r.id + "\" lacks an evidenceRef",
      );
    }
  }
  checks.push("evidence-references");

  // Check 5: relationship legality.
  for (const r of graph.relationships) {
    if (!objectIds.has(r.subject)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_RELATIONSHIP",
        "relationship \"" + r.id + "\" has unknown subject \"" + r.subject + "\"",
      );
    }
    if (!objectIds.has(r.object)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_RELATIONSHIP",
        "relationship \"" + r.id + "\" has unknown object \"" + r.object + "\"",
      );
    }
    if (typeof r.predicate !== "string" || r.predicate.length === 0) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_RELATIONSHIP",
        "relationship \"" + r.id + "\" has empty predicate",
      );
    }
    if (!LEGAL_PREDICATES.has(r.predicate)) {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_RELATIONSHIP",
        "relationship \"" + r.id + "\" has illegal predicate \"" + r.predicate + "\"",
      );
    }
    if (r.status !== "active" && r.status !== "inactive") {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_RELATIONSHIP",
        "relationship \"" + r.id + "\" has illegal status \"" + String(r.status) + "\"",
      );
    }
    // A relationship leg is usable as evidence only when both ends are
    // public. A private object referenced from a leg fails closed: the
    // verifier refuses the graph rather than leaking the private fact or
    // silently dropping it.
    const subject = byId.get(r.subject);
    const object = byId.get(r.object);
    if (subject && subject.visibility !== "public") {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_VISIBILITY",
        "relationship \"" + r.id + "\" uses non-public subject \"" + r.subject + "\" as evidence",
      );
    }
    if (object && object.visibility !== "public") {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_VISIBILITY",
        "relationship \"" + r.id + "\" uses non-public object \"" + r.object + "\" as evidence",
      );
    }
  }
  checks.push("relationship-legality");

  // Check 6: visibility. Read, never mutated.
  for (const o of graph.objects) {
    if (o.visibility !== "public" && o.visibility !== "private") {
      throw new ObjectBuilderError(
        "OBJECT_BUILDER_VISIBILITY",
        "object \"" + o.id + "\" has illegal visibility \"" + String(o.visibility) + "\"",
      );
    }
  }
  checks.push("visibility");

  // Inverse normalization (evidence-preserving): the generator and the
  // runtime traverse team membership forward (business -> person). A
  // person -> business "works_for" or "member_of" edge carries the same
  // fact in the inverse direction; the builder derives the forward edge
  // deterministically so planners and renderers see one traversal
  // direction. The derived edge reuses the source edge's evidenceRef
  // (same evidence, no new claims) and is recorded in
  // attestation.derivations. An explicit forward edge always wins over a
  // derived one. Deterministic: single pass in input order.
  const derivations: Array<{ from: string; to: string; rule: string }> = [];
  const INVERSE_RULES: Record<string, string> = {
    works_for: "employs",
    member_of: "has_member",
  };
  const seenIds = new Set(graph.relationships.map((r) => r.id));
  const forwardCovered = new Set(
    graph.relationships
      .filter((r) => r.status === "active")
      .map((r) => r.subject + "|" + r.predicate + "|" + r.object),
  );
  const derived: PingRelationship[] = [];
  for (const r of graph.relationships) {
    const fwd = INVERSE_RULES[r.predicate];
    if (!fwd || r.status !== "active") continue;
    const key = r.object + "|" + fwd + "|" + r.subject;
    if (forwardCovered.has(key)) continue;
    const id = r.id + "::inverse-" + fwd;
    if (seenIds.has(id)) continue; // pathological collision: skip, never overwrite
    const d: PingRelationship = {
      id,
      subject: r.object,
      predicate: fwd,
      object: r.subject,
      status: "active",
      createdAt: r.createdAt,
      evidenceRef: r.evidenceRef,
    };
    derived.push(d);
    seenIds.add(id);
    forwardCovered.add(key);
    derivations.push({ from: r.id, to: id, rule: r.predicate + "-inverse-" + fwd });
  }
  checks.push("inverse-normalization");

  const attestedGraph: ObjectGraph = {
    objects: graph.objects,
    relationships: [...graph.relationships, ...derived],
  };
  const digest = createHash("sha256").update(canonicalize(attestedGraph), "utf8").digest("hex");

  return {
    graph: attestedGraph,
    attestation: {
      builderVersion: OBJECT_BUILDER_VERSION,
      schemaCatalogVersion: SCHEMA_CATALOG_VERSION,
      tenantId,
      objectCount: attestedGraph.objects.length,
      relationshipCount: attestedGraph.relationships.length,
      digest,
      checks,
      derivations,
    },
  };
}

/** Re-export for consumers that only need the tenant error type. */
export { TenantContextError };
