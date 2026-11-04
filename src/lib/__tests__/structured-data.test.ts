import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
  buildAboutPageJsonLd,
  buildContactPageJsonLd,
  buildItemListJsonLd,
  buildCollectionPageJsonLd,
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

describe("buildAboutPageJsonLd", () => {
  it("emits AboutPage with the page name, url and description when supplied", () => {
    const ld = buildAboutPageJsonLd({
      name: "About Example",
      url: "https://example.test/about",
      description: "What the about page says.",
    });
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Example",
      url: "https://example.test/about",
      description: "What the about page says.",
    });
  });

  it("omits description when the caller cannot support one", () => {
    const ld = buildAboutPageJsonLd({ name: "About Example", url: "https://example.test/about" });
    expect(Object.keys(ld).sort()).toEqual(["@context", "@type", "name", "url"]);
  });
});

describe("buildContactPageJsonLd", () => {
  it("emits ContactPage with the page name, url and description when supplied", () => {
    const ld = buildContactPageJsonLd({
      name: "Contact",
      url: "https://example.test/contact",
      description: "How to reach the example organisation.",
    });
    expect(ld["@type"]).toBe("ContactPage");
    expect(ld.name).toBe("Contact");
    expect(ld.url).toBe("https://example.test/contact");
    expect(ld.description).toBe("How to reach the example organisation.");
  });
});

describe("buildItemListJsonLd", () => {
  it("numbers items from 1 in the order given, with exact names and urls", () => {
    const ld = buildItemListJsonLd([
      { name: "First offering", url: "https://example.test/contact" },
      { name: "Second offering", url: "https://example.test/technology" },
    ]);
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "First offering", item: "https://example.test/contact" },
      { "@type": "ListItem", position: 2, name: "Second offering", item: "https://example.test/technology" },
    ]);
  });
});

describe("buildCollectionPageJsonLd", () => {
  it("emits a CollectionPage whose mainEntity ItemList numbers items from 1 in order", () => {
    const ld = buildCollectionPageJsonLd({
      name: "Episodes",
      url: "https://example.test/episodes",
      description: "Every episode, listed.",
      items: [
        { name: "Episode One", url: "https://example.test/episodes/one" },
        { name: "Episode Two", url: "https://example.test/episodes/two" },
        { name: "Episode Three", url: "https://example.test/episodes/three" },
      ],
    });
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.name).toBe("Episodes");
    expect(ld.url).toBe("https://example.test/episodes");
    expect(ld.description).toBe("Every episode, listed.");
    expect(ld.mainEntity["@type"]).toBe("ItemList");
    expect(ld.mainEntity.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Episode One", item: "https://example.test/episodes/one" },
      { "@type": "ListItem", position: 2, name: "Episode Two", item: "https://example.test/episodes/two" },
      { "@type": "ListItem", position: 3, name: "Episode Three", item: "https://example.test/episodes/three" },
    ]);
  });

  it("omits description when the caller cannot support one", () => {
    const ld = buildCollectionPageJsonLd({
      name: "Episodes",
      url: "https://example.test/episodes",
      items: [{ name: "Episode One", url: "https://example.test/episodes/one" }],
    });
    expect("description" in ld).toBe(false);
    expect(ld.mainEntity.itemListElement).toHaveLength(1);
  });
});

describe("honest boundary", () => {
  it("no builder emits Product, Offer, price, rating, or review fields", () => {
    const all = JSON.stringify([
      buildOrganizationJsonLd({ name: "PING", url: "https://example.test" }),
      buildWebSiteJsonLd({ name: "PING", url: "https://example.test" }),
      buildBreadcrumbJsonLd([{ name: "Home", url: "https://example.test" }]),
      buildAboutPageJsonLd({ name: "About Example", url: "https://example.test/about" }),
      buildContactPageJsonLd({ name: "Contact", url: "https://example.test/contact" }),
      buildItemListJsonLd([{ name: "First offering", url: "https://example.test/contact" }]),
      buildCollectionPageJsonLd({ name: "Episodes", url: "https://example.test/episodes", items: [{ name: "Episode One", url: "https://example.test/episodes/one" }] }),
    ]);
    for (const banned of ["Product", "Offer", "price", "rating", "review", "Review"]) {
      expect(all).not.toContain(banned);
    }
  });
});
