import { Container, Section, SectionHeading } from "@/components/section";
import type { FaqItem } from "@/types/faq";

/**
 * Shared FAQ rendering, extracted from /faq in Wave 15 (B-11 first slice).
 *
 * One component renders both the visible FAQ section and its FAQPage
 * JSON-LD, generated from the exact items passed in, so the schema can
 * never describe questions the page does not display. Pages choose their
 * items from the shared FAQ authority (@/lib/faq); /faq passes all of
 * them, other pages pass their relevant category.
 */
export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function FaqSection({
  items,
  eyebrow = "FAQ",
  title,
  headingLevel = "h2",
  containerClassName,
  align = "left",
}: {
  items: FaqItem[];
  eyebrow?: string;
  title: string;
  headingLevel?: "h1" | "h2";
  containerClassName?: string;
  align?: "left" | "center";
}) {
  const faqJsonLd = buildFaqJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Section>
        <Container className={containerClassName}>
          <SectionHeading headingLevel={headingLevel} eyebrow={eyebrow} title={title} align={align} />
          <div className="faq-list mt-8 divide-y divide-border border-y border-border">
            {items.map((it) => (
              <details key={it.id} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-text">
                  {it.question}
                  <span className="text-accent transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="measure mt-3 text-text-muted">{it.answer}</p>
              </details>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
