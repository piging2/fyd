import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import { CTASection } from "@/components/cta-section";
import { FaqSection, buildFaqJsonLd } from "@/components/faq-section";
import { getAllFaqs } from "@/lib/faq";
import { BUYING_FAQ_ITEMS } from "@/lib/buying-faq";
import { serializeJsonLd } from "@/lib/json-ld";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "FAQ: Questions About PING and PingFyd",
  description: "Common questions about PING, PingFyd, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  alternates: { canonical: "/faq" },
  openGraph: {
    type: "website",
    title: "FAQ: Questions About PING and PingFyd · PING",
    description: "Common questions about PING, PingFyd, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
    url: siteUrl + "/faq",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "FAQ: Questions About PING and PingFyd · PING",
    description: "Common questions about PING, PingFyd, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  },
};

export default function FaqPage() {
  const faqItems = getAllFaqs();
  // One canonical FAQPage block for the whole page, generated from
  // exactly the questions both sections display (the consolidation
  // of record, 2026-11-24: the page previously emitted one block
  // per section, two in total).
  const pageJsonLd = buildFaqJsonLd([...faqItems, ...BUYING_FAQ_ITEMS]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageJsonLd) }}
      />
      <FaqSection items={faqItems} eyebrow="FAQ" title="Questions About PING" headingLevel="h1" emitJsonLd={false} />
      <FaqSection items={BUYING_FAQ_ITEMS} eyebrow="Buying" title="Buying Questions" emitJsonLd={false} />
      <CTASection />
    </>
  );
}
