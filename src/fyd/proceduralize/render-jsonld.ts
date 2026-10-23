/**
 * Item 10 (fyd-execution): OUTPUT-side LocalBusiness JSON-LD.
 *
 * This is the RENDER side: structured data derived ONLY from the same
 * effective public projection (`compilePublicSite`) that renders the
 * visible site. It is deliberately named distinctly from
 * proceduralize/structured-data.ts, which is the ACQUISITION side
 * (discovers JSON-LD/microdata in source HTML during ingest). The two
 * must never be conflated: one reads the web, the other projects the
 * verified public graph.
 *
 * INV-SD-1 (single truth source): the builder is a pure function of the
 * projection (plus an optional ownerObjectId selecting the subject; no
 * second fetch, no second graph query, no hardcoded per-site values, no
 * enrichment). Every factual read goes through visitorField — the SAME
 * reader the visible render uses — so visible truth and structured truth
 * cannot diverge (INV-SD-3).
 *
 * INV-SD-2 (no invented facts): the emitted key set is the projection's
 * field inventory plus fixed structural keys (@context, @type). Absent
 * from the projection = absent from the JSON-LD. In particular the
 * builder NEVER emits aggregateRating, review, openingHours, license,
 * priceRange, areaServed geography, or availability — there is no code
 * path that can produce them.
 *
 * Visibility: EVIDENCE != VISIBILITY. A hidden address stays in the
 * evidence/object layer and is cut at the projection boundary, so it is
 * absent from the projection graph and therefore absent from BOTH the
 * visible render and this JSON-LD — never lingering in structured data.
 *
 * INV-SD-4: every emitted factual value is returned as a claim
 * ({objectId, field, value}) so the test suite can run it through the
 * same BindingVerifier tap as visible render claims.
 */

import type { VerifiedPublicProjection } from "../sitespec/public-projection";
import { visitorField } from "../sitespec/visitor-knowledge";
import type { ObjectGraph } from "../sitespec/types";
import type { PingObject } from "../../lib/ping/types";

export interface JsonLdClaim {
  objectId: string;
  field: string;
  value: string;
}

export interface LocalBusinessJsonLd {
  node: Record<string, unknown>;
  claims: JsonLdClaim[];
}

/** Schema.org property names this builder is allowed to emit. Closed set. */
const ADDRESS_PARTS = [
  ["streetAddress", "streetAddress"],
  ["addressLocality", "addressLocality"],
  ["addressRegion", "addressRegion"],
  ["postalCode", "postalCode"],
  ["addressCountry", "addressCountry"],
] as const;

/**
 * The business subject of the projection: the spec's owner object when
 * the caller passes its id (the emission point holds the spec), else the
 * first public business-role object. Never guessed from names or URLs.
 */
function businessObject(
  graph: ObjectGraph,
  ownerObjectId?: string,
): PingObject | null {
  if (ownerObjectId) {
    const owned = graph.objects.find(
      (o) => o.id === ownerObjectId && o.visibility === "public",
    );
    if (owned) return owned;
  }
  return (
    graph.objects.find(
      (o) => o.visibility === "public" && /business/i.test(o.schema),
    ) ?? null
  );
}

/** Services the business offers, per the graph's active relationships. */
function offeredServices(graph: ObjectGraph, business: PingObject): PingObject[] {
  return graph.objects.filter(
    (o) =>
      o.visibility === "public" &&
      o.id !== business.id &&
      graph.relationships.some(
        (r) =>
          r.status === "active" &&
          ((r.subject === business.id &&
            r.object === o.id &&
            ["offers", "provides"].includes(r.predicate)) ||
            (r.object === business.id &&
              r.subject === o.id &&
              r.predicate === "provided_by")),
      ) &&
      visitorField(graph, o, "title") !== null,
  );
}

export function localBusinessJsonLd(
  projection: VerifiedPublicProjection,
  opts?: { ownerObjectId?: string },
): LocalBusinessJsonLd | null {
  const graph = projection.graph;
  const business = businessObject(graph, opts?.ownerObjectId);
  if (!business) return null;
  const read = (o: PingObject, field: string) => visitorField(graph, o, field);
  const claims: JsonLdClaim[] = [];
  const claim = (objectId: string, field: string, value: string | null) => {
    if (value !== null) claims.push({ objectId, field, value });
    return value;
  };

  const name = claim(business.id, "title", read(business, "title"));
  if (!name) return null;

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    // Subtype ONLY from an explicit projection-carried classification;
    // never guessed from the name, URL, or services.
    "@type": explicitSubtype(read(business, "schemaOrgType")),
    name,
  };

  const description = claim(business.id, "description", read(business, "description"));
  if (description) node.description = description;

  const telephone = claim(business.id, "phone", read(business, "phone"));
  if (telephone) node.telephone = telephone;

  const url = claim(business.id, "website", read(business, "website"));
  if (url) node.url = url;

  const address: Record<string, string> = { "@type": "PostalAddress" } as Record<string, string>;
  for (const [jsonKey, field] of ADDRESS_PARTS) {
    const part = claim(business.id, field, read(business, field));
    if (part) address[jsonKey] = part;
  }
  if (Object.keys(address).length > 1) node.address = address;

  const services = offeredServices(graph, business);
  if (services.length > 0) {
    node.makesOffer = services.map((s) => {
      const serviceName = claim(s.id, "title", read(s, "title"))!;
      return {
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: serviceName },
      };
    });
  }

  return { node, claims };
}

/**
 * An explicit schema.org subtype carried by the projection (e.g. an
 * owner-attested or ingested business-type classification). Anything not
 * shaped like a schema.org type name falls back to LocalBusiness: the
 * renderer is never authorized to invent a classification.
 */
function explicitSubtype(value: string | null): string {
  if (value && /^[A-Z][A-Za-z]{2,40}$/.test(value.trim())) return value.trim();
  return "LocalBusiness";
}

/**
 * Serialize for the <script type="application/ld+json"> emission point.
 * The emission point lives in the site page server components (they hold
 * the projection); this helper keeps the serialization in one place.
 * `<` is unicode-escaped so a factual value can never break out of the
 * script element.
 */
export function renderJsonLdScript(result: LocalBusinessJsonLd): string {
  return JSON.stringify(result.node).replace(/</g, "\\u003c");
}
