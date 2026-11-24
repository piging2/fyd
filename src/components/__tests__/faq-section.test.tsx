import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FaqSection, buildFaqJsonLd } from "../faq-section";
import { getFaqsByCategory, getAllFaqs } from "@/lib/faq";
import { BUYING_FAQ_ITEMS } from "@/lib/buying-faq";

/**
 * Wave 15 (B-11): the FAQPage JSON-LD on a page that reuses the shared
 * FAQ section must describe exactly the questions that page displays.
 * Exercised on the /products selection (the PING category).
 */
describe("FaqSection JSON-LD matches displayed questions", () => {
  const items = getFaqsByCategory("PING");

  it("selects a non-empty category from the shared FAQ data", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.category === "PING")).toBe(true);
  });

  it("buildFaqJsonLd emits exactly the given items, in order", () => {
    const ld = buildFaqJsonLd(items);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => q.name)).toEqual(items.map((i) => i.question));
    expect(ld.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(items.map((i) => i.answer));
  });

  it("keeps hostile FAQ text inside one JSON-LD script and preserves its facts", () => {
    const fixture = [{
      id: "script-termination-fixture",
      category: "Fixture",
      question: "Does A < B & C stay intact?",
      answer: '</ScRiPt><script id="unexpected-script">fixture</script><!--',
    }];
    const html = renderToStaticMarkup(<FaqSection items={fixture} title="Questions" />);
    expect(html.match(/<script\b/gi)).toHaveLength(1);
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain("<");
    expect(JSON.parse(match![1])).toEqual(buildFaqJsonLd(fixture));
    expect(html).toContain("Does A &lt; B &amp; C stay intact?");
  });

  it("rendered JSON-LD names equal the questions visible in the markup", () => {
    const html = renderToStaticMarkup(<FaqSection items={items} title="Questions about the products" />);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const ld = JSON.parse(match![1]);
    const names: string[] = ld.mainEntity.map((q: { name: string }) => q.name);
    expect(names).toEqual(items.map((i) => i.question));
    for (const name of names) {
      expect(html).toContain(name);
    }
    const detailsCount = (html.match(/<details/g) || []).length;
    expect(detailsCount).toBe(items.length);
  });
});

/**
 * Wave 23: /build-my-fyd mounts the shared section with the PingFyd
 * category, exactly as /fyd does. Its JSON-LD must describe exactly the
 * questions that mount displays.
 */
describe("FaqSection PingFyd mount for /build-my-fyd", () => {
  const socialItems = getFaqsByCategory("PingFyd");

  it("selects a non-empty PingFyd category from the shared FAQ data", () => {
    expect(socialItems.length).toBeGreaterThan(0);
    expect(socialItems.every((i) => i.category === "PingFyd")).toBe(true);
  });

  it("rendered JSON-LD names equal the visible PingFyd questions", () => {
    const html = renderToStaticMarkup(<FaqSection items={socialItems} title="Questions from business owners" />);
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const ld = JSON.parse(match![1]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(socialItems.map((i) => i.question));
    const detailsCount = (html.match(/<details/g) || []).length;
    expect(detailsCount).toBe(socialItems.length);
  });
});

/**
 * FAQPage consolidation (2026-11-24): a page mounting more than one
 * section opts out of per-section JSON-LD and emits one page-level
 * block over the union of its items (the /faq form). The opt-out
 * must suppress the script entirely while the visible questions
 * render unchanged.
 */
describe("FaqSection emitJsonLd opt-out (multi-section pages)", () => {
  const items = getFaqsByCategory("PING");

  it("renders no JSON-LD script with emitJsonLd={false}", () => {
    const html = renderToStaticMarkup(
      <FaqSection items={items} title="Questions" emitJsonLd={false} />,
    );
    expect(html).not.toContain("application/ld+json");
    const detailsCount = (html.match(/<details/g) || []).length;
    expect(detailsCount).toBe(items.length);
    for (const i of items) {
      expect(html).toContain(i.question);
    }
  });

  it("the /faq union block carries every displayed question once", () => {
    const union = [...getAllFaqs(), ...BUYING_FAQ_ITEMS];
    const ld = buildFaqJsonLd(union);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => q.name)).toEqual(
      union.map((i) => i.question),
    );
    const names = ld.mainEntity.map((q) => q.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
