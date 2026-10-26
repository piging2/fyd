import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { getAllFaqs } from "@/lib/faq";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://ping.vercel.app");

export const metadata: Metadata = {
  title: "FAQ",
  description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  alternates: { canonical: "/faq" },
  openGraph: {
    type: "website",
    title: "FAQ · PING",
    description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
    url: siteUrl + "/faq",
    images: [{ url: "/brand/og-card.png", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.png"],
    title: "FAQ · PING",
    description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  },
};

export default function FaqPage() {
  const faqItems = getAllFaqs();

  return (
    <>
      <Section>
        <Container>
          <SectionHeading headingLevel="h1" eyebrow="FAQ" title="Questions About PING" />
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
