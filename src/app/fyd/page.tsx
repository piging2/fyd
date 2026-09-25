import type { Metadata } from "next";
import { FydNav } from "./_components/fyd-nav";
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

export const metadata: Metadata = {
  title: "FYD: your business, understood",
  description:
    "FYD learns your business as connected things, builds your digital presence from that understanding, answers customers from evidence, and keeps you in control. Try it: paste your URL.",
  alternates: { canonical: "/fyd" },
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
      <main id="top">
        <FydHero />
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
        <FydTryIt />
      </main>
    </>
  );
}
