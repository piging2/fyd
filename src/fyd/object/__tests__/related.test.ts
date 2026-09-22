/**
 * Tests for selectRelatedCircles (../related): the deterministic
 * related-circle candidate selector.
 *
 * Tenant tests read the real fixture graphs (byte-copies of PING dump
 * output). Hostile cases use small synthetic graphs. The selector is
 * pure: no I/O, no fixtures needed beyond the graph shape.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { selectRelatedCircles } from "../related";
import type { ObjectGraph } from "../../sitespec/types";

const PROJECTIONS = join(__dirname, "fixtures", "projections");

const HAPPY_BUSINESS = "website-business-6fa5ebd99d72c4cb";
const HAPPY_LOCATION = "website-business-6fa5ebd99d72c4cb-location";
const HAPPY_SERVICE = "website-service-51de038c1defe8bd";
const COPPER_BUSINESS = "website-business-2f1327c09d622175";
const COPPER_LOCATION = "website-business-2f1327c09d622175-location";
const COPPER_PERSON = "website-business-2f1327c09d622175-person-377048d67856";
const COPPER_EXT = "website-business-2f1327c09d622175-ext-89604af059c2";

function graphOf(slug: string): ObjectGraph {
  const doc = JSON.parse(
    readFileSync(join(PROJECTIONS, slug + ".json"), "utf8"),
  ) as { graph: ObjectGraph };
  return doc.graph;
}

function mkObj(id: string, visibility: "public" | "private" = "public"): PingObject {
  return {
    id,
    schema: "ping.social.service@1",
    controllerId: "ctrl-1",
    visibility,
    title: id,
    description: "",
    fields: {},
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    provenance: {
      kind: "canonical-journal",
      ref: "ping-event:x",
      derivedAt: "2026-09-21T00:00:00Z",
    },
  };
}

function mkRel(
  subject: string,
  predicate: string,
  object: string,
  status: "active" | "inactive" = "active",
): PingRelationship {
  return {
    id: `${subject}|${predicate}|${object}|${status}`,
    subject,
    predicate,
    object,
    status,
    createdAt: "2026-09-21T00:00:00Z",
    evidenceRef: "ping-event:x",
  };
}

describe("selectRelatedCircles", () => {
  test("happy-place yields exactly the location and the service, ranked", () => {
    expect(selectRelatedCircles(graphOf("happy-place"), HAPPY_BUSINESS)).toEqual([
      { objectId: HAPPY_LOCATION, predicate: "located_at", direction: "out" },
      { objectId: HAPPY_SERVICE, predicate: "provides", direction: "out" },
    ]);
  });

  test("coppersmith yields location, person, and the two-hop external identity", () => {
    expect(selectRelatedCircles(graphOf("coppersmith-plumbing"), COPPER_BUSINESS)).toEqual([
      { objectId: COPPER_LOCATION, predicate: "located_at", direction: "out" },
      { objectId: COPPER_PERSON, predicate: "works_for", direction: "in" },
      { objectId: COPPER_EXT, predicate: "links_to", direction: "out" },
    ]);
  });

  test("deterministic: repeated runs and shuffled relationship order agree", () => {
    const graph = graphOf("coppersmith-plumbing");
    const first = selectRelatedCircles(graph, COPPER_BUSINESS);
    const second = selectRelatedCircles(graph, COPPER_BUSINESS);
    expect(second).toEqual(first);
    const shuffled: ObjectGraph = {
      objects: graph.objects,
      relationships: [...graph.relationships].reverse(),
    };
    expect(selectRelatedCircles(shuffled, COPPER_BUSINESS)).toEqual(first);
  });

  test("limit truncates after ranking", () => {
    const graph = graphOf("happy-place");
    expect(selectRelatedCircles(graph, HAPPY_BUSINESS, { limit: 1 })).toEqual([
      { objectId: HAPPY_LOCATION, predicate: "located_at", direction: "out" },
    ]);
    expect(selectRelatedCircles(graph, HAPPY_BUSINESS, { limit: 0 })).toEqual([]);
    expect(selectRelatedCircles(graph, HAPPY_BUSINESS, { limit: 10 })).toHaveLength(2);
  });

  test("hostile: graph with zero relationships -> empty array, not an error", () => {
    const graph: ObjectGraph = { objects: [mkObj("owner-1")], relationships: [] };
    expect(selectRelatedCircles(graph, "owner-1")).toEqual([]);
  });

  test("hostile: unknown owner -> empty array", () => {
    expect(selectRelatedCircles(graphOf("happy-place"), "nope")).toEqual([]);
  });

  test("hostile: non-public owner -> empty array", () => {
    const graph: ObjectGraph = {
      objects: [mkObj("owner-1", "private"), mkObj("svc-1")],
      relationships: [mkRel("owner-1", "provides", "svc-1")],
    };
    expect(selectRelatedCircles(graph, "owner-1")).toEqual([]);
  });

  test("inactive edges, self loops, and edges back to the owner are skipped", () => {
    const graph: ObjectGraph = {
      objects: [mkObj("owner-1"), mkObj("svc-1"), mkObj("loc-1")],
      relationships: [
        mkRel("owner-1", "provides", "svc-1", "inactive"),
        mkRel("owner-1", "located_at", "owner-1"), // self loop
        mkRel("loc-1", "describes", "owner-1"), // leads back to the owner
        mkRel("owner-1", "located_at", "loc-1"),
      ],
    };
    expect(selectRelatedCircles(graph, "owner-1")).toEqual([
      { objectId: "loc-1", predicate: "located_at", direction: "out" },
    ]);
  });

  test("non-public and unknown targets are never surfaced", () => {
    const graph: ObjectGraph = {
      objects: [mkObj("owner-1"), mkObj("svc-secret", "private")],
      relationships: [
        mkRel("owner-1", "provides", "svc-secret"),
        mkRel("owner-1", "provides", "ghost-1"),
      ],
    };
    expect(selectRelatedCircles(graph, "owner-1")).toEqual([]);
  });

  test("best edge wins when one object is reachable twice; unknown predicates rank last", () => {
    const graph: ObjectGraph = {
      objects: [mkObj("owner-1"), mkObj("svc-1"), mkObj("misc-1")],
      relationships: [
        mkRel("owner-1", "provides", "svc-1"),
        mkRel("owner-1", "located_at", "svc-1"),
        mkRel("owner-1", "mentions", "misc-1"),
      ],
    };
    expect(selectRelatedCircles(graph, "owner-1")).toEqual([
      { objectId: "svc-1", predicate: "located_at", direction: "out" },
      { objectId: "misc-1", predicate: "mentions", direction: "out" },
    ]);
  });
});
