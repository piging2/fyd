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

/**
 * The four visible-statement classifications for a presentation binding.
 *
 * - direct: the presented value is accepted evidence, shown verbatim.
 * - derived: the presented value is a deterministic transform of present
 *   evidence (formatting, joining, unit conversion).
 * - generated: the presented value was AI-written; it must name the
 *   generator that produced it, bound to evidence.
 * - owner_authored: the presented value is owner state, which is durable
 *   and survives re-ingestion.
 */
export type BindingClassification = "direct" | "derived" | "generated" | "owner_authored";

/**
 * A single factual claim a renderer wants to show: which object, which
 * field, and how the presented statement is classified. evidenceRef and
 * generatorRef are carrier metadata; the verifier never treats them as
 * authoritative on their own.
 */
export interface PresentationBinding {
  objectId: string;
  field: string;
  classification: BindingClassification;
  evidenceRef?: string;
  generatorRef?: string;
}

/** Verdict of the presentation binding check: fail closed. */
export type BindingVerdict = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Field value read, like fieldOf but preserving the bound/unbound
 * distinction. "title" and "description" are object-level factual identity
 * and bind as pseudo-fields: a direct binding still requires the object's
 * provenance ref, exactly like any other direct field.
 */
function boundFieldValue(o: PingObject, name: string): string | undefined {
  if (name === "title") return o.title === "" ? undefined : o.title;
  if (name === "description") return o.description === "" ? undefined : o.description;
  const v = o.fields[name];
  if (typeof v === "string") return v === "" ? undefined : v;
  if (Array.isArray(v)) {
    const joined = v.filter((s) => s !== "").join(", ");
    return joined === "" ? undefined : joined;
  }
  return undefined;
}

/** The four classifications this verifier recognizes. */
const CLASSIFICATIONS: readonly BindingClassification[] = [
  "direct",
  "derived",
  "generated",
  "owner_authored",
];

/**
 * Verify that a presentation binding resolves to an accepted fact.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. This is a
 * verifier, not an authority: it answers whether the presented statement
 * resolves to accepted evidence (direct, via the object's provenance.ref),
 * a deterministic transform of present evidence (derived), owner state
 * (owner_authored), or an explicitly classified generated statement
 * (generated, via a generatorRef of the form name@version). Anything else
 * fails closed and the caller omits the value.
 */
export function verifyPresentationBinding(
  binding: PresentationBinding,
  graph: ObjectGraph
): BindingVerdict {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const obj = objects.get(binding.objectId);
  if (!obj) return { ok: false, reason: "unknown object" };
  const value = boundFieldValue(obj, binding.field);
  if (value === undefined) return { ok: false, reason: "unbound field" };
  if (!CLASSIFICATIONS.includes(binding.classification)) {
    return { ok: false, reason: "unknown classification" };
  }
  switch (binding.classification) {
    case "direct":
      if (!obj.provenance || obj.provenance.ref === "") {
        return { ok: false, reason: "no evidence ref" };
      }
      return { ok: true, value };
    case "generated":
      if (
        typeof binding.generatorRef !== "string" ||
        !/^[^\s@]+@[^\s@]+$/.test(binding.generatorRef)
      ) {
        return { ok: false, reason: "no generator ref" };
      }
      return { ok: true, value };
    case "derived":
    case "owner_authored":
      return { ok: true, value };
  }
  return { ok: false, reason: "unknown classification" };
}

/**
 * Resolve a presentation binding to its display value.
 *
 * Returns the verified value, or undefined when the binding does not
 * verify. undefined means the caller must OMIT the value, never guess.
 */
export function resolveBoundField(
  graph: ObjectGraph,
  binding: PresentationBinding
): string | undefined {
  const verdict = verifyPresentationBinding(binding, graph);
  return verdict.ok ? verdict.value : undefined;
}
