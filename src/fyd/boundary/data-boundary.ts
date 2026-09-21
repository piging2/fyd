/**
 * Template/data boundary (Nolan's law):
 * WE OWN ALL INFRASTRUCTURE. THEY OWN THEIR DATA.
 * PING IS A SERVICE PROVIDER MANAGING THEIR DATA.
 *
 * Customer-owned (portable, separable, exportable, deletable):
 *   identity, facts, media, content, object graph, SiteSpec,
 *   owner overrides, evidence history.
 * FYD-owned (shared infrastructure, never customer-specific):
 *   design system, component registry, pipeline, renderer, derivative cache.
 *
 * The general template makes the boundary crisp:
 * - Where personal identity begins (their data/brand/content) and where
 *   FYD begins (shared infrastructure) is declared here, in code, and
 *   enforced by data-boundary.test.ts.
 * - Customer data is never trapped in FYD internals: it travels as a
 *   CustomerDataPackage that can be exported (exportCustomerData) and
 *   dropped (the package is a plain value; deleting it deletes the data).
 * - No customer facts are baked into shared components; no FYD
 *   infrastructure leaks into the customer data layer. Either direction
 *   fails the boundary test.
 */

export const CUSTOMER_OWNED = [
  "identity",
  "facts",
  "media",
  "content",
  "objectGraph",
  "siteSpec",
  "ownerOverrides",
  "evidenceHistory",
] as const;

export const FYD_OWNED = [
  "designSystem",
  "componentRegistry",
  "pipeline",
  "renderer",
  "derivativeCache",
] as const;

export type CustomerOwnedKind = (typeof CUSTOMER_OWNED)[number];
export type FydOwnedKind = (typeof FYD_OWNED)[number];

/**
 * The portable customer data package. Everything in here belongs to the
 * business. It contains no FYD infrastructure: no component code, no
 * registry entries, no pipeline internals, no renderer state. References
 * to FYD-managed derivatives are by content digest (verifiable) not by
 * internal path.
 */
export interface CustomerDataPackage {
  format: "fyd.customer-data@1";
  exportedAt: string;
  /** The business's identity: name, site id, source URL. */
  identity: {
    name: string;
    siteId: string;
    sourceUrl: string;
  };
  /** Extracted facts. */
  facts: unknown;
  /** Media manifests: provenance, digests, rights, variant lineage. */
  media: unknown;
  /** Content: copy, headings, descriptions. */
  content: unknown;
  /** The observed object graph: identity, facts, content, relationships. */
  objectGraph: unknown;
  /** The generated SiteSpec: pages, sections, bindings, presentation. */
  siteSpec: unknown;
  /** Owner decisions: visibility, corrections, approved patches. */
  ownerOverrides: unknown;
  /** Evidence history: observations and their sources. */
  evidenceHistory: unknown;
}

export interface SiteBundleInput {
  identity: CustomerDataPackage["identity"];
  facts: unknown;
  media: unknown;
  content: unknown;
  objectGraph: unknown;
  siteSpec: unknown;
  ownerOverrides: unknown;
  evidenceHistory: unknown;
}

/**
 * Separate the customer-owned data from a site bundle. FYD infrastructure
 * never enters the package: the caller passes only data, and what comes
 * out is data the business can take elsewhere.
 */
export function separateCustomerData(input: SiteBundleInput): CustomerDataPackage {
  return {
    format: "fyd.customer-data@1",
    exportedAt: new Date().toISOString(),
    identity: { ...input.identity },
    facts: input.facts,
    media: input.media,
    content: input.content,
    objectGraph: input.objectGraph,
    siteSpec: input.siteSpec,
    ownerOverrides: input.ownerOverrides,
    evidenceHistory: input.evidenceHistory,
  };
}

/**
 * Export the customer package as portable JSON. This is the "take your
 * data with you" operation: everything the business owns, in one document,
 * with no FYD internals.
 */
export function exportCustomerData(pkg: CustomerDataPackage): string {
  return JSON.stringify(pkg, null, 2);
}

/**
 * Parse an exported package back. Rejects anything that is not a customer
 * data package, so FYD internals can never be smuggled in as customer data.
 */
export function importCustomerData(json: string): CustomerDataPackage {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") throw new Error("Not a customer data package.");
  const rec = parsed as Record<string, unknown>;
  if (rec["format"] !== "fyd.customer-data@1") throw new Error("Not a customer data package.");
  for (const k of CUSTOMER_OWNED) {
    if (!(k in rec)) throw new Error(`Customer data package is missing "${k}".`);
  }
  return parsed as CustomerDataPackage;
}

/**
 * Owner-facing statement of the boundary. For "What FYD manages for you":
 * FYD manages and hosts the customer's data as a service provider, never
 * as its owner.
 */
export function boundaryStatement(): string {
  return (
    "Your data is yours. FYD manages it as your service provider: " +
    CUSTOMER_OWNED.join(", ") +
    ". FYD owns only the shared machinery every site runs on: " +
    FYD_OWNED.join(", ") +
    ". Your data stays separable, exportable, and deletable at any time."
  );
}
