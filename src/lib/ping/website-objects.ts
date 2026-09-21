/**
 * Website-derived objects (Lane A). SERVER ONLY.
 *
 * The PING Social website itself is public content. This module projects a
 * deterministic, clearly-labeled set of PING objects from it:
 *   - published blog posts      -> ping.social.article@1
 *   - products authority entries -> ping.social.product@1
 *   - the tenant business itself  -> ping.social.business@1
 *
 * These are PROJECTIONS, not canonical journal objects: provenance.kind is
 * "website-derived" and the ref is the source content path. They are never
 * written to the journal, never presented as canonical events, and they
 * merge with gateway objects only at read time in the BFF.
 *
 * For website-derived objects, createdAt/updatedAt are the derivation
 * times; the content's own date (e.g. an article publish date) is carried
 * in fields.date. Nothing is invented: fields come straight from the
 * content files and config authorities.
 */

import type { PingObject, PingRelationship } from "./types";
import { getAllPosts } from "@/lib/blog";
import { getProducts } from "@/lib/products";
import { getTenant } from "@/lib/tenant-config";

export const WEBSITE_BUSINESS_ID = "web:business:ping-social";

function derivedProvenance(ref: string, derivedAt: string) {
  return { kind: "website-derived" as const, ref, derivedAt };
}

function articleObjects(derivedAt: string): PingObject[] {
  return getAllPosts()
    .filter((p) => p.status === "published")
    .map((p) => ({
      id: `web:article:${p.slug}`,
      schema: "ping.social.article@1",
      controllerId: WEBSITE_BUSINESS_ID,
      visibility: "public" as const,
      title: p.title,
      description: p.excerpt || "",
      fields: {
        url: `/blog/${p.slug}`,
        date: p.date,
        ...(p.tags.length > 0 ? { tags: p.tags } : {}),
      },
      createdAt: derivedAt,
      updatedAt: derivedAt,
      provenance: derivedProvenance(`src/content/blog/${p.slug}.md`, derivedAt),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function productObjects(derivedAt: string): PingObject[] {
  return getProducts().map((p) => ({
    id: `web:product:${p.id}`,
    schema: "ping.social.product@1",
    controllerId: WEBSITE_BUSINESS_ID,
    visibility: "public" as const,
    title: p.name,
    description: p.summary || p.tagline,
    fields: {
      tagline: p.tagline,
      status: p.status,
      url: p.cta.href,
      ...(p.offers && p.offers.length > 0 ? { offers: p.offers } : {}),
    },
    createdAt: derivedAt,
    updatedAt: derivedAt,
    provenance: derivedProvenance("src/config/products.ping.v1.json", derivedAt),
  }));
}

function businessObject(derivedAt: string): PingObject {
  const tenant = getTenant();
  const contact = (tenant.contact ?? {}) as unknown as Record<string, unknown>;
  const fields: Record<string, string | string[]> = {
    category: "AI automation consultancy",
  };
  const facebook = typeof contact.facebook === "string" ? contact.facebook : "";
  if (facebook) fields.facebook = facebook;
  // domain/url/website are null in the tenant manifest tonight: omit them
  // rather than inventing a domain. Never fake data.
  return {
    id: WEBSITE_BUSINESS_ID,
    schema: "ping.social.business@1",
    controllerId: WEBSITE_BUSINESS_ID,
    visibility: "public",
    title: "PING Social",
    description: tenant.description || tenant.tagline,
    fields,
    createdAt: derivedAt,
    updatedAt: derivedAt,
    provenance: derivedProvenance("src/config/tenant.ping.v1.json", derivedAt),
  };
}

/**
 * All website-derived objects, sorted by stable id. Deterministic given the
 * content on disk.
 */
export function getWebsiteObjects(): PingObject[] {
  const derivedAt = new Date().toISOString();
  return [businessObject(derivedAt), ...productObjects(derivedAt), ...articleObjects(derivedAt)];
}

/**
 * Website-derived relationships: the business provides its products and
 * publishes its articles. Predicate vocabulary is descriptive; these never
 * touch the canonical follows/likes predicates.
 */
export function getWebsiteRelationships(): PingRelationship[] {
  const derivedAt = new Date().toISOString();
  const rels: PingRelationship[] = [];
  for (const p of getProducts()) {
    rels.push({
      id: `web:rel:provides:${p.id}`,
      subject: WEBSITE_BUSINESS_ID,
      predicate: "provides",
      object: `web:product:${p.id}`,
      status: "active",
      createdAt: derivedAt,
      evidenceRef: "src/config/products.ping.v1.json",
    });
  }
  for (const post of getAllPosts().filter((p) => p.status === "published")) {
    rels.push({
      id: `web:rel:publishes:${post.slug}`,
      subject: WEBSITE_BUSINESS_ID,
      predicate: "publishes",
      object: `web:article:${post.slug}`,
      status: "active",
      createdAt: derivedAt,
      evidenceRef: `src/content/blog/${post.slug}.md`,
    });
  }
  rels.sort((a, b) => (a.id < b.id ? -1 : 1));
  return rels;
}
