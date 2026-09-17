import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { getAllFaqs } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Common questions about PING, PING Social, continuity, and the TenantOS direction.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const faqItems = getAllFaqs();

  return (
    <>
      <Section>
        <Container>
          <SectionHeading eyebrow="FAQ" title="Questions About PING" />
          <div className="faq-list mt-8 divide-y divide-border border-y border-border">
            {faqItems.map((it) => (
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
      <CTASection />
    </>
  );
}
