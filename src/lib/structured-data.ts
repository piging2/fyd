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

export interface WebPageInput {
  name: string;
  url: string;
  description?: string;
}

/**
 * AboutPage and ContactPage are WebPage subtypes in schema.org, used
 * only on the pages they literally describe: the about page is about
 * the organisation, and the contact page is the contact page. Name,
 * url, and description come from the page's own metadata, so the
 * structured data cannot drift from the page it annotates.
 */
export function buildAboutPageJsonLd(input: WebPageInput) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
  };
}

export function buildContactPageJsonLd(input: WebPageInput) {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
  };
}

export interface ItemListItemInput {
  name: string;
  url: string;
}

/**
 * ItemList names, in order, exactly the items a page visibly lists.
 * Entries are plain ListItem values carrying a name and the URL the
 * page itself links that item to. This is not a Product builder: no
 * Product type, no Offer, no price, and no rating is emitted, in line
 * with the honest boundary at the top of this file.
 */
function listItemElements(items: ItemListItemInput[]) {
  return items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  }));
}

export function buildItemListJsonLd(items: ItemListItemInput[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: listItemElements(items),
  };
}

export interface CollectionPageInput {
  name: string;
  url: string;
  description?: string;
  items: ItemListItemInput[];
}

/**
 * CollectionPage carries, as its mainEntity, one ItemList naming, in
 * order, exactly the items the collection page visibly lists. Used for
 * index pages whose whole job is the list (the episodes index). No
 * fields beyond the page own name, url, description, and the listed
 * items are emitted.
 */
export function buildCollectionPageJsonLd(input: CollectionPageInput) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: listItemElements(input.items),
    },
  };
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
