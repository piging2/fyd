/**
 * Shared object-graph helpers for the site compiler.
 *
 * Pure, deterministic, browser-safe. Used by the generator (section
 * existence) and the renderer (display), so both agree on what the graph
 * says. No company-specific logic: every rule here holds for any graph.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "./types";

function fieldOf(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
}

/**
 * Resolve the public website URL for an owner object.
 *
 * The website field on the business comes first. Otherwise follow
 * has_website relationships to website objects and read their url field:
 * the website is its own object in the knowledge vocabulary, never
 * duplicated onto the business. First URL in sort order wins, so the
 * result is deterministic.
 */
export function resolveWebsiteUrl(graph: ObjectGraph, ownerId: string): string {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const owner = objects.get(ownerId);
  if (owner && owner.visibility === "public") {
    const direct = fieldOf(owner, "website");
    if (direct !== "") return direct;
  }
  const urls: string[] = [];
  for (const r of graph.relationships) {
    if (r.subject !== ownerId) continue;
    if (r.status !== "active") continue;
    if (r.predicate !== "has_website") continue;
    const target = objects.get(r.object);
    if (target && target.visibility === "public") {
      const url = fieldOf(target, "url");
      if (url !== "") urls.push(url);
    }
  }
  urls.sort();
  return urls[0] ?? "";
}
