import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import { FydChapterIndex, FydNav } from "./_components/fyd-nav";
import { FydHero } from "./_components/fyd-hero";
import { FydUnderstand } from "./_components/fyd-understand";
import { FydObjects } from "./_components/fyd-objects";
import { FydDemoSites } from "./_components/fyd-demo-sites";
import { FydHowItWorks } from "./_components/fyd-how-it-works";
import { FydAskDemo } from "./_components/fyd-ask-demo";
import { FydWhy } from "./_components/fyd-why";
import { FydOwnerCorrection } from "./_components/fyd-owner-correction";
import { FydNetwork } from "./_components/fyd-network";
import { FydPingUnderneath } from "./_components/fyd-ping-underneath";
import { FydPrivacy } from "./_components/fyd-privacy";
import { FydWhatIsReal } from "./_components/fyd-what-is-real";
import { FydTryIt } from "./_components/fyd-try-it";
import { FaqSection } from "@/components/faq-section";
import { getFaqsByCategory } from "@/lib/faq";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "FYD: your business, understood",
  description:
    "FYD learns your business once, builds your website from that understanding, and answers your customers from it. You stay in control. Try it with your own URL.",
  alternates: { canonical: "/fyd" },
  openGraph: {
    type: "website",
    title: "FYD: your business, understood · PING",
    description: "FYD learns your business once, builds your website from that understanding, and answers your customers from it. You stay in control. Try it with your own URL.",
    url: siteUrl + "/fyd",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "FYD: your business, understood · PING",
    description: "FYD learns your business once, builds your website from that understanding, and answers your customers from it. You stay in control. Try it with your own URL.",
  },
};

/**
 * /fyd: the dedicated FYD human-facing product surface.
 *
 * Education spine first: hero, understand, how it works, network,
 * PING underneath, your data, try it. Dogfood interactions woven in:
 * functional margin objects, live demo sites, Ask FYD, WHY THIS,
 * owner correction. Every capability claim carries its copy class.
 */
export default function FydProductPage() {
  return (
    <>
      <FydNav />
      <div id="top" className="md:[&>div[id]]:scroll-mt-16">
        <FydHero />
        <FydChapterIndex />
        <FydUnderstand />
        <FydObjects />
        <FydDemoSites />
        <FydHowItWorks />
        <FydAskDemo />
        <FydWhy />
        <FydOwnerCorrection />
        <FydNetwork />
        <FydPingUnderneath />
        <FydPrivacy />
        <FydWhatIsReal />
        <FaqSection items={getFaqsByCategory("PingFyd")} eyebrow="FAQ" title="Questions from business owners" containerClassName="max-w-5xl" align="center" />
        <FydTryIt />
      </div>
    </>
  );
}
