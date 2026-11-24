import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  buildAboutPageJsonLd,
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
  buildContactPageJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildPingFydOffersJsonLd,
  buildProductOffersJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structured-data";
import { serializeJsonLd } from "@/lib/json-ld";

/**
 * JSON-LD standing gate (2026-11-24).
 *
 * The defect this guards: /faq mounted two FAQ sections and so
 * emitted two FAQPage blocks for one page, a duplication no builder
 * unit test could see because each block was valid on its own. The
 * census that found it was one-time; this suite makes the rule
 * standing. Every page under src/app is discovered by its FaqSection
 * mounts, and the invariant is exact: emitting mounts plus
 * page-level buildFaqJsonLd blocks equals one FAQPage per page.
 *
 * The sweep half guards the builders themselves: every exported
 * builder's output must survive the site's own serializer and a
 * JSON round trip with its type intact, and the PingFyd offers
 * builder must keep carrying the locked price book.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function appPages(): string[] {
  const root = join(process.cwd(), "src/app");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) out.push(full);
    }
  };
  walk(root);
  return out;
}

function faqSectionMounts(source: string): { total: number; emitting: number } {
  const tags = source.match(/<FaqSection[\s\S]*?(?:\/>|>)/g) ?? [];
  const emitting = tags.filter((t) => !t.includes("emitJsonLd={false}")).length;
  return { total: tags.length, emitting };
}

describe("one FAQPage block per page (standing)", () => {
  const pages = appPages()
    .map((p) => ({ path: p, source: readFileSync(p, "utf8") }))
    .filter(({ source }) => source.includes("<FaqSection"));

  it("discovers the FaqSection-mounting pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pages.map(({ path }) => path))(
    "%s emits exactly one FAQPage block",
    (path) => {
      const { source } = pages.find((p) => p.path === path)!;
      const { emitting } = faqSectionMounts(source);
      const pageLevel = (source.match(/buildFaqJsonLd\(/g) ?? []).length;
      expect(emitting + pageLevel).toBe(1);
    },
  );

  it("the shared essay-questions component mounts one emitting section", () => {
    const src = read("src/components/essay-questions.tsx");
    const { total, emitting } = faqSectionMounts(src);
    expect(total).toBe(1);
    expect(emitting).toBe(1);
  });
});

describe("builder serialization sweep", () => {
  const base = "https://pingfyd.com";
  const outputs: Record<string, unknown> = {
    organization: buildOrganizationJsonLd({ name: "PING", url: base }),
    website: buildWebSiteJsonLd({ name: "PING", url: base }),
    about: buildAboutPageJsonLd({ name: "About", url: base + "/about" }),
    contact: buildContactPageJsonLd({ name: "Contact", url: base + "/contact" }),
    itemList: buildItemListJsonLd([{ name: "One", url: base + "/one" }]),
    collection: buildCollectionPageJsonLd({
      name: "Episodes",
      url: base + "/episodes",
      items: [{ name: "One", url: base + "/episodes/one" }],
    }),
    breadcrumb: buildBreadcrumbJsonLd([
      { name: "Home", url: base },
      { name: "FAQ", url: base + "/faq" },
    ]),
    productOffers: buildProductOffersJsonLd({
      name: "PingFyd",
      url: base + "/tiers",
      offers: [{ name: "Self-Hosted", price: 0 }],
    }),
    pingFydOffers: buildPingFydOffersJsonLd(base),
  };

  it.each(Object.keys(outputs))(
    "%s round-trips through the serializer with its type intact",
    (key) => {
      const parsed = JSON.parse(serializeJsonLd(outputs[key]));
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(typeof parsed["@type"]).toBe("string");
      expect(parsed["@type"].length).toBeGreaterThan(0);
    },
  );
});

describe("the PingFyd offers builder carries the locked price book", () => {
  const ld = buildPingFydOffersJsonLd("https://pingfyd.com") as {
    offers: { name: string; price: number; priceCurrency: string }[];
  };

  it("emits exactly the seven published offers at their locked prices", () => {
    expect(ld.offers.map((o) => [o.name, o.price])).toEqual([
      ["Self-Hosted", 0],
      ["Hosted DIY Launch", 29],
      ["Hosted DIY Growth", 59],
      ["Extra site on Hosted DIY", 15],
      ["Concierge Build", 2500],
      ["Concierge Retainer", 1250],
      ["AI Workspace", 10000],
    ]);
    expect(ld.offers.every((o) => o.priceCurrency === "USD")).toBe(true);
  });
});
