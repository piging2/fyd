import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EssayQuestions } from "../essay-questions";
import { buildFaqJsonLd } from "../faq-section";
import { ESSAY_QUESTIONS, getEssayQuestions } from "@/lib/essay-questions";
import { getAllPosts } from "@/lib/blog";

/**
 * Wave 31 pilot, Wave 32 batch 2 (regrade defect 7): for an essay with data, the FAQPage
 * JSON-LD must describe exactly the questions the page displays, both
 * generated from the same items in src/lib/essay-questions. For a post
 * with no data, the section must not render at all.
 */
describe("essay questions pilot data", () => {
  it("covers exactly the pilot and batch 2 slugs, each resolving to a real post", () => {
    expect(Object.keys(ESSAY_QUESTIONS).sort()).toEqual([
      "airplane-mode-postmortem",
      "the-440-million-typo",
      "the-machine-that-trusted-its-software",
      "the-night-gitlab-deleted-itself",
      "the-retry-that-charged-twice",
      "the-scheduler-said-it-ran",
      "the-space-probe-that-measured-in-pounds",
      "the-standup-is-a-distributed-system",
      "what-a-hash-taught-us-about-trust",
    ]);
    const published = new Set(getAllPosts().map((p) => p.slug));
    for (const slug of Object.keys(ESSAY_QUESTIONS)) {
      expect(published.has(slug)).toBe(true);
      expect(getEssayQuestions(slug).length).toBe(3);
    }
  });

  it("returns no items for a post without data", () => {
    expect(getEssayQuestions("the-airline-that-lost-its-planes")).toEqual([]);
    expect(getEssayQuestions("no-such-post")).toEqual([]);
  });
});

describe("essay questions schema equals display", () => {
  const slug = "the-retry-that-charged-twice";
  const items = getEssayQuestions(slug);

  it("buildFaqJsonLd emits exactly the pilot items, in order", () => {
    const ld = buildFaqJsonLd(items);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => q.name)).toEqual(items.map((i) => i.question));
    expect(ld.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(
      items.map((i) => i.answer),
    );
  });

  it("rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const html = renderToStaticMarkup(<EssayQuestions slug={slug} />);
    expect(html).toContain("Questions this essay answers");
    const scripts = html.match(/<script type="application\/ld\+json">/g) || [];
    expect(scripts.length).toBe(1);
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    expect(match).not.toBeNull();
    const ld = JSON.parse(match![1]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(
      items.map((i) => i.question),
    );
    for (const item of items) {
      expect(html).toContain(item.question);
      expect(html).toContain(item.answer);
    }
    const detailsCount = (html.match(/<details/g) || []).length;
    expect(detailsCount).toBe(items.length);
  });

  it("batch 2 essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "airplane-mode-postmortem",
      "the-standup-is-a-distributed-system",
      "what-a-hash-taught-us-about-trust",
      "the-space-probe-that-measured-in-pounds",
      "the-machine-that-trusted-its-software",
      "the-night-gitlab-deleted-itself",
    ];
    for (const batchSlug of batch) {
      const batchItems = getEssayQuestions(batchSlug);
      expect(batchItems.length).toBe(3);
      const html = renderToStaticMarkup(<EssayQuestions slug={batchSlug} />);
      const scripts = html.match(/<script type="application\/ld\+json">/g) || [];
      expect(scripts.length).toBe(1);
      const match = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      );
      const ld = JSON.parse(match![1]);
      expect(ld["@type"]).toBe("FAQPage");
      expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(
        batchItems.map((i) => i.question),
      );
      expect(
        ld.mainEntity.map(
          (q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text,
        ),
      ).toEqual(batchItems.map((i) => i.answer));
      for (const item of batchItems) {
        expect(html).toContain(item.question);
        expect(html).toContain(item.answer);
      }
      expect((html.match(/<details/g) || []).length).toBe(3);
    }
  });

  it("renders nothing for a post with no data", () => {
    const html = renderToStaticMarkup(
      <EssayQuestions slug="the-airline-that-lost-its-planes" />,
    );
    expect(html).toBe("");
  });
});
