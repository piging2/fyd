import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import { CTASection } from "@/components/cta-section";
import { FaqSection } from "@/components/faq-section";
import { getAllFaqs } from "@/lib/faq";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

export const metadata: Metadata = {
  title: "FAQ: Questions About PING and PING Social",
  description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  alternates: { canonical: "/faq" },
  openGraph: {
    type: "website",
    title: "FAQ: Questions About PING and PING Social · PING",
    description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
    url: siteUrl + "/faq",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "FAQ: Questions About PING and PING Social · PING",
    description: "Common questions about PING, PING Social, continuity, and the TenantOS direction: what continuity means, how evidence works, and how a business gets started.",
  },
};

export default function FaqPage() {
  const faqItems = getAllFaqs();
  return (
    <>
      <FaqSection items={faqItems} eyebrow="FAQ" title="Questions About PING" headingLevel="h1" />
      <CTASection />
    </>
  );
}
