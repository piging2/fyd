/**
 * Locked fixtures for the structured-data extraction pipeline.
 * Each fixture is real-shape JSON-LD (no invented businesses beyond the
 * synthetic "Acme" examples); the Coppersmith fixture is the verbatim
 * block from the real site's bytes.
 */

export interface StructuredFixture {
  name: string;
  html: string;
}

function page(name: string, ...blocks: string[]): StructuredFixture {
  const scripts = blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join("\n");
  return {
    name,
    html: `<!doctype html><html><head><title>Fixture</title>\n${scripts}\n</head><body></body></html>`,
  };
}

/** 1. Simple Organization. */
export const FIXTURE_ORG_SIMPLE: StructuredFixture = page(
  "org-simple",
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acme Services",
    url: "https://acme-services.example.com",
    telephone: "970-555-0100",
    email: "hello@acme-services.example.com",
  }),
);

/** 2. LocalBusiness (Happy Place shape, synthetic values). */
export const FIXTURE_LOCAL_BUSINESS: StructuredFixture = page(
  "local-business",
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Acme Carpentry LLC",
    logo: "https://acme.example.com/brand/logo.png",
    image: "https://acme.example.com/images/hero.jpg",
    url: "https://acme.example.com",
    telephone: "+19705550100",
    email: "crew@acme.example.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Grand Junction",
      addressRegion: "CO",
      addressCountry: "US",
    },
    areaServed: "Mesa County, Colorado",
    priceRange: "$$",
  }),
);

/** 3. @graph with Organization + WebSite and a publisher @id reference. */
export const FIXTURE_GRAPH_ORG_WEBSITE: StructuredFixture = page(
  "graph-org-website",
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://acme.example.com/#organization",
        name: "Acme Services",
        url: "https://acme.example.com",
        telephone: "970-555-0100",
      },
      {
        "@type": "WebSite",
        "@id": "https://acme.example.com/#website",
        url: "https://acme.example.com/",
        name: "Acme Services",
        publisher: { "@id": "https://acme.example.com/#organization" },
        inLanguage: "en-US",
      },
    ],
  }),
);

/** 4. Nested PostalAddress: streetAddress is private and must be
 *  classified + withheld, never projected. */
export const FIXTURE_NESTED_POSTAL_ADDRESS: StructuredFixture = page(
  "nested-postal-address",
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://acme.example.com/#business",
    name: "Acme Plumbing",
    telephone: "970-555-0100",
    address: {
      "@type": "PostalAddress",
      streetAddress: "123 Main St",
      addressLocality: "Grand Junction",
      addressRegion: "Colorado",
      postalCode: "81501",
      addressCountry: "United States",
    },
  }),
);

/** 5. sameAs[]: external-identity/link candidates with evidence. */
export const FIXTURE_SAME_AS: StructuredFixture = page(
  "same-as",
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://acme.example.com/#org",
    name: "Acme Services",
    url: "https://acme.example.com",
    sameAs: [
      "https://www.facebook.com/acmeservices",
      "https://www.instagram.com/acmeservices",
      "https://www.yelp.com/biz/acme-services",
    ],
  }),
);

/** 6. Multiple @type values on one node. */
export const FIXTURE_MULTI_TYPE: StructuredFixture = page(
  "multi-type",
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["Plumber", "Organization"],
    "@id": "https://acme.example.com/#organization",
    name: "Acme Plumbing - Heating - Cooling",
    url: "https://acme.example.com",
    telephone: "970-555-0100",
  }),
);

/** 7. @id references between nodes: Organization <-> Place (location),
 *  WebPage (about / isPartOf), Person (author). */
export const FIXTURE_ID_REFERENCES: StructuredFixture = page(
  "id-references",
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Place",
        "@id": "https://acme.example.com/#place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Fruita",
          addressRegion: "CO",
        },
      },
      {
        "@type": "Organization",
        "@id": "https://acme.example.com/#organization",
        name: "Acme Services",
        url: "https://acme.example.com",
        location: { "@id": "https://acme.example.com/#place" },
      },
      {
        "@type": "WebPage",
        "@id": "https://acme.example.com/#webpage",
        url: "https://acme.example.com/",
        name: "Acme Services",
        about: { "@id": "https://acme.example.com/#organization" },
        isPartOf: { "@id": "https://acme.example.com/#website" },
        author: { "@id": "https://acme.example.com/#author" },
      },
      {
        "@type": "WebSite",
        "@id": "https://acme.example.com/#website",
        url: "https://acme.example.com/",
        name: "Acme Services",
      },
      {
        "@type": "Person",
        "@id": "https://acme.example.com/#author",
        name: "Sam Rivera",
        jobTitle: "Owner",
        worksFor: { "@id": "https://acme.example.com/#organization" },
      },
    ],
  }),
);

/** 8. Service and Product entities. */
export const FIXTURE_SERVICE_PRODUCT: StructuredFixture = page(
  "service-product",
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://acme.example.com/#organization",
        name: "Acme HVAC",
        url: "https://acme.example.com",
        telephone: "970-555-0100",
      },
      {
        "@type": "Service",
        "@id": "https://acme.example.com/#service-furnace",
        name: "Furnace repair",
        description: "Same-day furnace diagnostics and repair.",
        provider: { "@id": "https://acme.example.com/#organization" },
      },
      {
        "@type": "Product",
        "@id": "https://acme.example.com/#product-filter",
        name: "HEPA filter 20x25x4",
        description: "High-efficiency replacement filter.",
      },
    ],
  }),
);

/** 9. Malformed JSON-LD: the bad block is recorded as unsupported
 *  evidence; the good block still parses. */
export const FIXTURE_MALFORMED: StructuredFixture = page(
  "malformed",
  `{"@context": "https://schema.org", "@type": "Organization", "name": "Broken",`,
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acme Services",
    telephone: "970-555-0100",
  }),
);

export const ALL_STRUCTURED_FIXTURES: StructuredFixture[] = [
  FIXTURE_ORG_SIMPLE,
  FIXTURE_LOCAL_BUSINESS,
  FIXTURE_GRAPH_ORG_WEBSITE,
  FIXTURE_NESTED_POSTAL_ADDRESS,
  FIXTURE_SAME_AS,
  FIXTURE_MULTI_TYPE,
  FIXTURE_ID_REFERENCES,
  FIXTURE_SERVICE_PRODUCT,
  FIXTURE_MALFORMED,
];
