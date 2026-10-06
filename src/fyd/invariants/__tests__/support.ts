/**
 * LANE-INVARIANTS shared test support.
 *
 * Reuses the validated clearwater-plumbing-demo fixture (25 objects /
 * 24 relationships, conflicting Saturday hours) owned by the owner-mode
 * lane, and small synthetic hostile graphs for seam probes. All clocks
 * pinned; no I/O beyond fixture reads; no network.
 */

import * as fs from "fs";
import * as path from "path";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { SiteFact } from "../../owner-mode/facts";

/** Pinned extraction clock. */
export const T0 = "2026-09-23T19:30:00.000Z";
/** Pinned spec generation clock. */
export const PIN_GENERATED_AT = "2026-09-24T00:30:00.000Z";

/** The validated second-site fixture graph. */
export function clearwaterGraph(): ObjectGraph {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "owner-mode",
        "__tests__",
        "clearwater-plumbing-demo.json",
      ),
      "utf8",
    ),
  ) as { graph: { objects: unknown[]; relationships: unknown[] } };
  return {
    objects: raw.graph.objects as PingObject[],
    relationships: raw.graph.relationships as PingRelationship[],
  };
}

/**
 * Deterministic permutation of a graph: deep clone with reversed object
 * and relationship order. Same content, different emission order.
 */
export function reversedGraph(g: ObjectGraph): ObjectGraph {
  const clone = JSON.parse(JSON.stringify(g)) as ObjectGraph;
  clone.objects.reverse();
  clone.relationships.reverse();
  return clone;
}

/** Order-independent identity key for one extracted fact. */
export function factKey(f: SiteFact): string {
  return [f.factId, f.objectId, f.field, f.index, f.value, f.kind].join("|");
}

/** Minimal valid PingObject for synthetic seam probes. */
export function makeObject(
  id: string,
  fields: Record<string, string | string[]> = {},
  extra: Partial<PingObject> = {},
): PingObject {
  return {
    id,
    schema: "fyd:business",
    controllerId: id,
    visibility: "public",
    title: id,
    description: "",
    fields,
    createdAt: T0,
    updatedAt: T0,
    provenance: {
      kind: "website-derived",
      ref: "https://example.com",
      derivedAt: T0,
    },
    ...extra,
  };
}

/** Minimal valid PingRelationship for synthetic seam probes. */
export function makeRel(
  id: string,
  subject: string,
  predicate: string,
  object: string,
): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: T0,
    evidenceRef: "ev-" + id,
  };
}

/** Find one object in a graph by id; throws when absent. */
export function objectById(g: ObjectGraph, id: string): PingObject {
  const o = g.objects.find((x) => x.id === id);
  if (!o) throw new Error("fixture missing object " + id);
  return o;
}
