/**
 * Semantic media attachment: manifest -> object graph.
 *
 * Pure function: (base graph, manifest) -> augmented graph. The base
 * graph is never mutated; media objects and semantic relationships are
 * appended.
 *
 * Attachment is SEMANTIC, not positional: the predicate is chosen by the
 * SUBJECT's schema, never by page layout:
 * - Business represented_by Media (the business's own imagery, logos
 *   included: a logo represents the business; roles still distinguish it)
 * - Service illustrated_by Media
 * - Project has_media Media
 * - anything else: has_image (legacy fallback)
 *
 * SiteSpec consumers (Page, Circle, ObjectView, and later feed/social/
 * agent context) select media by walking these relationships from the
 * object: mediaForObject(). One truth: the manifest store; the graph
 * carries the semantic linkage. Deterministic: relationship ids derive
 * from the media digest + predicate.
 */

import type { ObjectGraph } from "../sitespec/types";
import type { PingObject, PingRelationship } from "../../lib/ping/types";
import { MEDIA_SCHEMA_ID, isAcquirable, type FydMediaObject, type MediaManifest } from "./types";

/** Semantic media predicates, by subject schema. Exported for selectors. */
export const MEDIA_PREDICATES = [
  "represented_by",
  "illustrated_by",
  "has_media",
  "has_image",
] as const;

export type MediaPredicate = (typeof MEDIA_PREDICATES)[number];

/** Predicate for a media attachment whose subject has the given schema. */
export function predicateForSubjectSchema(schema: string): MediaPredicate {
  if (/business/.test(schema)) return "represented_by";
  if (/service/.test(schema)) return "illustrated_by";
  if (/project/.test(schema)) return "has_media";
  return "has_image";
}

function mediaToObject(m: FydMediaObject, ownerId: string, observedAt: string): PingObject {
  const hero = m.variants.find((v) => v.name === "hero") ?? m.variants.find((v) => v.name === "w1600");
  const thumb = m.variants.find((v) => v.name === "thumbnail");
  return {
    id: m.id,
    schema: MEDIA_SCHEMA_ID,
    controllerId: "web:" + ownerId,
    visibility: "public",
    title: m.title,
    description:
      "Image from the business website (" + m.width + "x" + m.height + ", " + m.originalFormat + "). " + m.rightsBasis,
    fields: {
      digest: m.digest,
      rights_source: m.rightsSource,
      rights_basis: m.rightsBasis,
      roles: m.roles.join(","),
      source_url: m.provenance.sourceUrl,
      source_page: m.provenance.sourcePage,
      observed_at: m.provenance.observedAt,
      width: String(m.width),
      height: String(m.height),
      hero_url: hero?.url ?? "",
      thumbnail_url: thumb?.url ?? "",
      alt_text: m.altText ?? "",
      alt_text_source: m.altTextSource,
    },
    createdAt: observedAt,
    updatedAt: observedAt,
    provenance: {
      kind: "website-derived",
      ref: "fyd-media:" + m.provenance.sourceUrl,
      derivedAt: m.provenance.observedAt,
    },
  };
}

/**
 * Append media objects + semantic relationships. depicts[] on the
 * manifest entries names the object ids the media belongs to; when empty,
 * media depicting the business attaches to the owner business via
 * represented_by.
 */
export function attachMediaToGraph(graph: ObjectGraph, manifest: MediaManifest): ObjectGraph {
  if (manifest.media.length === 0) return graph;
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  // Owner rule mirrors the generator/findOwner: the lowest-id public
  // business. Undepicted media represents the business.
  const ownerId =
    graph.objects
      .filter((o) => /business/.test(o.schema) && o.visibility === "public")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]?.id ??
    graph.objects.find((o) => /business/.test(o.schema))?.id ??
    "";
  const objects: PingObject[] = graph.objects.slice();
  const relationships: PingRelationship[] = graph.relationships.slice();

  for (const m of manifest.media) {
    // Defense in depth: the rights gate in ingest.ts never mints
    // reference-only assets, but the graph must never carry one either.
    if (!isAcquirable(m.rightsSource)) continue;
    if (objects.some((o) => o.id === m.id)) continue;
    objects.push(mediaToObject(m, ownerId, manifest.generatedAt));
    const targets = m.depicts.length > 0 ? m.depicts : ownerId ? [ownerId] : [];
    for (const target of targets) {
      const subject = byId.get(target);
      const predicate = predicateForSubjectSchema(subject?.schema ?? "");
      relationships.push({
        id: "rel-" + m.digest.slice(0, 12) + "-" + predicate.replace(/_/g, ""),
        subject: target,
        predicate,
        object: m.id,
        status: "active",
        createdAt: manifest.generatedAt,
        evidenceRef: "fyd-media:" + m.provenance.sourceUrl,
      });
    }
  }
  return { objects, relationships };
}

/**
 * Select the media attached to an object via the semantic predicates.
 * The ONE selector every consumer (Page, Circle, ObjectView, feed, agent
 * context) uses: media follows its object, never a page slot.
 * Deterministic: ascending media id order.
 */
export function mediaForObject(graph: ObjectGraph, objectId: string): PingObject[] {
  const mediaIds = new Set<string>();
  for (const r of graph.relationships) {
    if (r.subject !== objectId) continue;
    if (r.status !== "active") continue;
    if (!(MEDIA_PREDICATES as readonly string[]).includes(r.predicate)) continue;
    mediaIds.add(r.object);
  }
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const out: PingObject[] = [];
  for (const id of [...mediaIds].sort()) {
    const o = byId.get(id);
    if (o && o.schema === MEDIA_SCHEMA_ID && o.visibility === "public") out.push(o);
  }
  return out;
}
