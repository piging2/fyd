/**
 * Shared structured data builders (Wave 17, B-14).
 *
 * One pure function per JSON-LD type, data in and JSON-LD out, in the
 * pattern of buildFaqJsonLd from Wave 15 (src/components/faq-section.tsx).
 * Every field a builder emits must be backed by visible page content or
 * a true site fact passed in by the caller; builders never invent data
 * and omit any field the caller cannot support.
 *
 * Honest boundary: this site sells nothing with public prices and has
 * no reviews, so there is deliberately no Product, Offer, price,
 * rating, or review builder here, and none may be added until the site
 * itself carries that content.
 */

export interface OrganizationInput {
  name: string;
  url: string;
  description?: string;
  logo?: string;
  telephone?: string;
  sameAs?: string[];
  founderName?: string;
}

export function buildOrganizationJsonLd(input: OrganizationInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.sameAs && input.sameAs.length > 0 ? { sameAs: [...input.sameAs] } : {}),
    ...(input.founderName
      ? { founder: { "@type": "Person", name: input.founderName } }
      : {}),
  };
}

export interface WebSiteInput {
  name: string;
  url: string;
}

/**
 * WebSite carries name and url only. No SearchAction: the site has no
 * search endpoint, so claiming one would describe a feature visitors
 * cannot use.
 */
export function buildWebSiteJsonLd(input: WebSiteInput) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: input.url,
  };
}

export interface BreadcrumbItemInput {
  name: string;
  url: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItemInput[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
