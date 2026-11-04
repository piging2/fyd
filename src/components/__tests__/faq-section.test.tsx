import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FaqSection, buildFaqJsonLd } from "../faq-section";
import { getFaqsByCategory } from "@/lib/faq";

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
