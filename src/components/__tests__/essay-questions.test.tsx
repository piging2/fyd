import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EssayQuestions } from "../essay-questions";
import { buildFaqJsonLd } from "../faq-section";
import { ESSAY_QUESTIONS, getEssayQuestions } from "@/lib/essay-questions";
import { getAllPosts } from "@/lib/blog";

/**
 * Wave 31 pilot, Wave 32 batch 2, Wave 33 batch 3, Wave 34 batch 4, Wave 35 batch 5, Wave 36 batch 6, Wave 37 final batch (regrade defect 7), Wave 38 same wave addition, Wave 39 same wave addition: for an essay with data, the FAQPage
 * JSON-LD must describe exactly the questions the page displays, both
 * generated from the same items in src/lib/essay-questions. For a post
 * with no data, the section must not render at all.
 */
describe("essay questions pilot data", () => {
  it("covers exactly the pilot, batches 2 to 6, the final batch and the Wave 38 and Wave 39 same wave slugs, each resolving to a real post", () => {
    expect(Object.keys(ESSAY_QUESTIONS).sort()).toEqual([
      "airplane-mode-postmortem",
      "building-agent-execution-boundaries",
      "evidence-and-provenance-for-autonomous-systems",
      "hpp-to-ping-first-tenant",
      "one-password-no-second-factor",
      "the-440-million-typo",
      "the-airline-that-lost-its-planes",
      "the-bank-that-moved-house",
      "the-biggest-debut-priced-by-a-glitch",
      "the-blackout-was-a-software-bug",
      "the-boat-that-stopped-the-world",
      "the-bug-that-didnt-bite",
      "the-certificate-that-expired",
      "the-day-facebook-deleted-itself",
      "the-day-github-was-in-two-places-at-once",
      "the-day-the-market-fell-off-a-cliff",
      "the-day-the-phone-book-burned",
      "the-graduate-student-who-counted-the-internet",
      "the-grid-problem",
      "the-machine-that-trusted-its-software",
      "the-most-expensive-second-in-history",
      "the-night-gitlab-deleted-itself",
      "the-night-the-backups-burned-too",
      "the-phone-that-became-a-grenade",
      "the-retry-that-charged-twice",
      "the-rocket-that-overflowed",
      "the-rover-that-kept-rebooting-itself",
      "the-scheduler-said-it-ran",
      "the-sensor-that-voted-alone",
      "the-space-probe-that-measured-in-pounds",
      "the-standup-is-a-distributed-system",
      "the-typo-that-emptied-the-shelves",
      "the-update-everyone-trusted",
      "the-update-that-grounded-the-planet",
      "the-water-wheel-problem",
      "the-website-that-launched-to-everyone-at-once",
      "the-worm-that-ate-the-hospitals",
      "what-a-hash-taught-us-about-trust",
      "what-survives-10000-years",
      "why-continuity-matters-for-ai-agents",
    ]);
    const published = new Set(getAllPosts().map((p) => p.slug));
    for (const slug of Object.keys(ESSAY_QUESTIONS)) {
      expect(published.has(slug)).toBe(true);
      expect(getEssayQuestions(slug).length).toBe(3);
    }
  });

  it("returns no items for a post without data", () => {
    expect(getEssayQuestions("no-such-post")).toEqual([]);
  });

  it("covers every published post: full coverage enumeration (Wave 37, defect 7 closed; Wave 38 and Wave 39 same wave additions)", () => {
    const posts = getAllPosts();
    expect(posts.length).toBe(40);
    for (const post of posts) {
      expect({ slug: post.slug, count: getEssayQuestions(post.slug).length }).toEqual({
        slug: post.slug,
        count: 3,
      });
    }
    expect(Object.keys(ESSAY_QUESTIONS).length).toBe(posts.length);
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

  it("batch 3 essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-rocket-that-overflowed",
      "the-update-that-grounded-the-planet",
      "the-boat-that-stopped-the-world",
      "the-bug-that-didnt-bite",
      "the-blackout-was-a-software-bug",
      "the-day-facebook-deleted-itself",
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

  it("batch 4 essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-typo-that-emptied-the-shelves",
      "the-day-the-phone-book-burned",
      "the-worm-that-ate-the-hospitals",
      "the-most-expensive-second-in-history",
      "the-certificate-that-expired",
      "the-phone-that-became-a-grenade",
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

  it("batch 5 essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-update-everyone-trusted",
      "the-sensor-that-voted-alone",
      "the-airline-that-lost-its-planes",
      "one-password-no-second-factor",
      "the-day-the-market-fell-off-a-cliff",
      "the-bank-that-moved-house",
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


  it("batch 6 essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-graduate-student-who-counted-the-internet",
      "the-grid-problem",
      "the-water-wheel-problem",
      "what-survives-10000-years",
      "why-continuity-matters-for-ai-agents",
      "building-agent-execution-boundaries",
      "evidence-and-provenance-for-autonomous-systems",
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

  it("final batch essays: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "hpp-to-ping-first-tenant",
      "the-website-that-launched-to-everyone-at-once",
      "the-biggest-debut-priced-by-a-glitch",
      "the-rover-that-kept-rebooting-itself",
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

  it("wave 38 essay: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-night-the-backups-burned-too",
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

  it("wave 39 essay: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    const batch = [
      "the-day-github-was-in-two-places-at-once",
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

  it("all slugs: rendered section shows the same questions as its JSON-LD, exactly once", () => {
    for (const slug of Object.keys(ESSAY_QUESTIONS)) {
      const items = getEssayQuestions(slug);
      expect(items.length).toBe(3);
      const html = renderToStaticMarkup(<EssayQuestions slug={slug} />);
      const scripts = html.match(/<script type="application\/ld\+json">/g) || [];
      expect(scripts.length).toBe(1);
      const match = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      );
      const ld = JSON.parse(match![1]);
      expect(ld["@type"]).toBe("FAQPage");
      expect(ld.mainEntity.map((q: { name: string }) => q.name)).toEqual(
        items.map((i) => i.question),
      );
      expect(
        ld.mainEntity.map(
          (q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text,
        ),
      ).toEqual(items.map((i) => i.answer));
      expect((html.match(/<details/g) || []).length).toBe(3);
    }
  });

  it("renders nothing for a post with no data", () => {
    const html = renderToStaticMarkup(
      <EssayQuestions slug="no-such-post" />,
    );
    expect(html).toBe("");
  });
});
