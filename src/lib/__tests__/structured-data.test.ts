import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
} from "../structured-data";

/**
 * Wave 17 (B-14): the shared structured data builders emit exactly the
 * fields their callers can back with visible content or true site
 * facts, and nothing else.
 */
describe("buildOrganizationJsonLd", () => {
  it("emits name, url, logo, sameAs, telephone, description and founder when supplied", () => {
    const ld = buildOrganizationJsonLd({
      name: "PING",
      url: "https://example.test",
      description: "A real description.",
      logo: "https://example.test/brand/logo.png",
      telephone: "(970) 555-0100",
      sameAs: ["https://www.facebook.com/example", "https://x.com/example"],
      founderName: "Example Founder",
    });
    expect(ld["@type"]).toBe("Organization");
    expect(ld.name).toBe("PING");
    expect(ld.url).toBe("https://example.test");
    expect(ld.logo).toBe("https://example.test/brand/logo.png");
    expect(ld.sameAs).toEqual(["https://www.facebook.com/example", "https://x.com/example"]);
    expect(ld.telephone).toBe("(970) 555-0100");
    expect(ld.description).toBe("A real description.");
    expect(ld.founder).toEqual({ "@type": "Person", name: "Example Founder" });
  });

  it("omits every optional field the caller cannot support", () => {
    const ld = buildOrganizationJsonLd({ name: "PING", url: "https://example.test" });
    expect(Object.keys(ld).sort()).toEqual(["@context", "@type", "name", "url"]);
  });

  it("omits sameAs when the list is empty rather than emitting an empty array", () => {
    const ld = buildOrganizationJsonLd({ name: "PING", url: "https://example.test", sameAs: [] });
    expect("sameAs" in ld).toBe(false);
  });
});

describe("buildWebSiteJsonLd", () => {
  it("emits name and url only, with no SearchAction", () => {
    const ld = buildWebSiteJsonLd({ name: "PING", url: "https://example.test" });
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PING",
      url: "https://example.test",
    });
    expect(JSON.stringify(ld)).not.toContain("SearchAction");
    expect(JSON.stringify(ld)).not.toContain("potentialAction");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers items from 1 in the order given, with exact names and urls", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://example.test" },
      { name: "Technology", url: "https://example.test/technology" },
      { name: "Evidence", url: "https://example.test/technology/evidence" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://example.test" },
      { "@type": "ListItem", position: 2, name: "Technology", item: "https://example.test/technology" },
      { "@type": "ListItem", position: 3, name: "Evidence", item: "https://example.test/technology/evidence" },
    ]);
  });
});

describe("honest boundary", () => {
  it("no builder emits Product, Offer, price, rating, or review fields", () => {
    const all = JSON.stringify([
      buildOrganizationJsonLd({ name: "PING", url: "https://example.test" }),
      buildWebSiteJsonLd({ name: "PING", url: "https://example.test" }),
      buildBreadcrumbJsonLd([{ name: "Home", url: "https://example.test" }]),
    ]);
    for (const banned of ["Product", "Offer", "price", "rating", "review", "Review"]) {
      expect(all).not.toContain(banned);
    }
  });
});
