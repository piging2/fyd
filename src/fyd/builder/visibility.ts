/**
 * Visibility is distinct from fact.
 *
 * Visibility controls are persisted owner decisions (the owner store's
 * visibility commands, the projection's visibility flags). This module is
 * the planner-side gate: only public objects are bound into public
 * sections. It NEVER mutates an object's visibility or its facts to
 * implement privacy: hiding a fact is a filter at render-binding time,
 * not an edit of the fact.
 *
 * A private object referenced by a public binding is a hard failure
 * (fail closed), not a silent drop: a silent drop would let a privacy
 * decision hide inside composition.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";

/** The public objects of a graph, in id order. Facts untouched. */
export function publicObjects(graph: ObjectGraph): PingObject[] {
  return graph.objects
    .filter((o) => o.visibility === "public")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Assert that every object id a binding references is public. Throws on
 * the first private (or unknown) id: the binding is refused, the fact is
 * never mutated, and nothing renders from it.
 */
export function assertNoPrivateLeak(graph: ObjectGraph, bindingObjectIds: string[]): void {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  for (const id of bindingObjectIds) {
    const o = byId.get(id);
    if (!o) {
      throw new Error(
        "Visibility gate: binding references unknown object \"" + id + "\": refused.",
      );
    }
    if (o.visibility !== "public") {
      throw new Error(
        "Visibility gate: binding references non-public object \"" + id +
          "\": refused. Visibility is an owner decision; the fact is untouched.",
      );
    }
  }
}
