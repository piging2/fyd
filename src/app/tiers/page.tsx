import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container, Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import { buildItemListJsonLd, buildPingFydOffersJsonLd } from "@/lib/structured-data";
import { FaqSection } from "@/components/faq-section";
import { BUYING_FAQ_ITEMS } from "@/lib/buying-faq";
import { getTenant } from "@/lib/tenant-config";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export const revalidate = 3600;

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

export const metadata: Metadata = {
  title: "Pricing: $0 Self-Hosted, $29 Hosted, $2,500 Concierge",
  description:
    "Self-Hosted free forever. Hosted DIY: Launch $29/mo, Growth $59/mo, ticket caps, no 1:1 time. Concierge: Builds $2,500, Retainers $1,250/mo, capped hours.",
  alternates: { canonical: "/tiers" },
  openGraph: {
    type: "website",
    title: "Pricing: $0 Self-Hosted, $29 Hosted, $2,500 Concierge",
    description: "Self-Hosted free forever. Hosted DIY: Launch $29/mo, Growth $59/mo, ticket caps, no 1:1 time. Concierge: Builds $2,500, Retainers $1,250/mo, capped hours.",
    url: siteUrl + "/tiers",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "Pricing: $0 Self-Hosted, $29 Hosted, $2,500 Concierge",
    description: "Self-Hosted free forever. Hosted DIY: Launch $29/mo, Growth $59/mo, ticket caps, no 1:1 time. Concierge: Builds $2,500, Retainers $1,250/mo, capped hours.",
  },
};

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[15px] text-text-muted">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-honey-text" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TiersPage() {
  const tenant = getTenant();
  const base = tenant.domain ?? "https://pingfyd.com";
  const itemListJsonLd = buildItemListJsonLd([
    { name: "Self-Hosted", url: base + "/tiers#self-hosted" },
    { name: "Hosted DIY", url: base + "/tiers#hosted" },
    { name: "Concierge", url: base + "/tiers#concierge" },
    { name: "AI Workspace", url: base + "/tiers#ai-workspace" },
  ]);
  const offersJsonLd = buildPingFydOffersJsonLd(base);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(offersJsonLd) }} />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em]"><span className="text-honey">Pricing</span></p>
          <h1 className="mt-4 font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            Three tiers, one workspace. Priced in the open.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            Every tier starts from the same place: your site, your listings, and your follow-up,
            working from one record of your business. The tiers differ in who does the work. Run
            it yourself with the machinery handled, or hand it over inside a fixed number of hours.
          </p>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            The prices are below, and so is the logic that produced them. Owner time is the scarce
            resource in this business, so it is priced like one: a $200 per hour floor, packages
            built to realize $250, hours capped in writing, and no discounting, ever. The logic is
            published so you can check the price before the first conversation, not during it.
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid md:grid-cols-3">
            <div id="self-hosted" className="md:pr-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">Tier 1 · Self-Hosted</h2>
              <p className="mt-4 text-4xl font-bold text-text">$0</p>
              <p className="mt-1 text-sm text-text-muted">Forever. No license fee, no per-seat fee. You run it, you host it. The generated site prints your services, hours, and phone in words from your structured profile, the same substance standard as the paid tiers; what the free tier leaves out is the hosting and the hands, not the words.</p>
              <p className="mt-4 text-[15px] text-text-muted"><span className="font-medium text-text">For:</span> owners and builders who run their own stack. <span className="font-medium text-text">Outcome:</span> a site generated from your structured profile, on your hosting, at no license cost.</p>
              <List items={[
                "The open core: site generation from a structured profile, the ad-object renderer, the backend core",
                "The Build-in-Open Library: the same playbooks Tier 2 uses, given away",
                "Public documentation and community support",
                "Security fixes on the public release train",
              ]} />
              <p className="mt-6 text-sm font-medium text-text">Stated plainly, not included:</p>
              <p className="mt-2 text-[15px] text-text-muted">
                No hosting. No 1:1 help of any kind. No updates SLA, no managed upgrades, no backups,
                no priority support. If you need a hand, Tier 2 and Tier 3 are the hands.
              </p>
              <p className="mt-6 text-sm font-medium text-text">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-text-muted">
                <li>Take the open core and the Build-in-Open Library.</li>
                <li>Generate your site from your structured profile.</li>
                <li>Host it and run it yourself; community support is the channel.</li>
              </ol>
              <p className="mt-8">
                <Link href="/open" className="font-medium text-honey-text underline-offset-4 hover:underline">
                  Read the library
                </Link>
              </p>
            </div>

            <div id="hosted" className="mt-12 border-t border-border pt-10 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">Tier 2 · Hosted DIY</h2>
              <p className="mt-4 text-4xl font-bold text-text">$29<span className="text-base font-medium text-text-muted"> / mo</span></p>
              <p className="mt-1 text-sm text-text-muted">
                Launch: $29/mo or $290/yr (two months free). Growth: $59/mo or $590/yr, up to 3 sites,
                additional sites $15/site/mo. A second site is for a second location: its own page,
                its own hours, and its own phone number, so a customer never lands on the other
                town's facts.
              </p>
              <p className="mt-4 text-[15px] text-text-muted"><span className="font-medium text-text">For:</span> owners who will run it themselves and want the machinery handled. <span className="font-medium text-text">Outcome:</span> your site live on managed hosting, carrying your services, hours, and phone in words a customer and an answer engine can read, every inquiry captured in one inbox with attribution, support by ticket.</p>
              <p className="mt-6 text-sm font-medium text-text">Everything in Self-Hosted, plus:</p>
              <List items={[
                "Managed hosting: uptime, backups, updates, and security patches handled",
                "Your site generated from your verified profile, with an editing surface you control",
                "An answers page you can grow yourself from the library's question templates, starting with the questions you are tired of answering",
                "FYD objects with attribution: views, clicks, and inquiries kept distinct",
                "Lead inbox with notifications, a custom domain, and a verified business profile",
                "Your hours, phone, and address checked against your public listings when your profile is verified, and printed the same way on your site: one set of hours, everywhere a customer looks",
                "The Build-in-Open Library as your onboarding: playbooks, templates, checklists, and self-serve evals, including the review ask playbook: who to ask, when, and what to say",
                "Async ticket support, next business day target: 3 tickets/mo on Launch, 6 on Growth",
              ]} />
              <p className="mt-6 text-[15px] text-text-muted">
                Growth adds advanced attribution and a priority support queue. One boundary holds at
                both levels: <span className="font-medium text-text">zero 1:1 owner time, ever.</span>{" "}
                No done-for-you work, no phone support, no guaranteed leads or rankings.
              </p>
              <p className="mt-6 text-sm font-medium text-text">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-text-muted">
                <li>We read what a customer finds today: your listing, the site it points to, your hours and phone. If the link points at a directory page or the wrong business, you hear it from us first, in plain terms.</li>
                <li>Start from the contact form.</li>
                <li>Your site is generated from your verified profile and placed on managed hosting.</li>
                <li>You edit and run it day to day; tickets bring async support on a next business day target.</li>
              </ol>
              <p className="mt-8">
                <Link href="/contact" className={cn(buttonVariants({ variant: "primary" }), "bg-honey text-honey-foreground shadow-warm hover:bg-honey-hover")}>
                  Start Hosted DIY
                </Link>
              </p>
            </div>

            <div id="concierge" className="mt-12 border-t border-border pt-10 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">Tier 3 · Concierge</h2>
              <p className="mt-4 text-4xl font-bold text-text">$2,500</p>
              <p className="mt-1 text-sm text-text-muted">
                The Build, fixed. The Retainer is $1,250/mo. We run it for you, inside capped owner hours.
              </p>
              <p className="mt-4 text-[15px] text-text-muted"><span className="font-medium text-text">For:</span> owners buying back hours. <span className="font-medium text-text">Outcome:</span> a finished site and offer, lead flow tested end to end, then a monthly review of what it produced.</p>
              <List items={[
                "Concierge Build, $2,500 fixed: profile, site finished by hand where it matters, offer written with you, objects placed, lead flow tested end to end",
                "An answers page written with you from the questions your customers actually ask, in your words, so the site answers them before the phone rings",
                "Build hours capped at 10 owner hours, logged and visible to you; at the cap, work stops or converts, never silently overflows",
                "Concierge Retainer, $1,250/mo: up to 5 owner hours a month for iteration, campaign adjustments, a monthly review ask sent to that month's finished jobs, and a monthly performance review",
                "Overage is prepaid only: $250/hr, or extra time in prepaid 5-hour blocks at $1,250. Unused retainer hours expire monthly",
              ]} />
              <p className="mt-6 text-[15px] text-text-muted">
                Capacity, stated rather than implied: concierge work is delivered in evenings and
                weekends, because school hours are school hours. Slots are limited. When capacity is
                full, a waitlist holds your place with a $500 deposit, credited in full against your
                first package.
              </p>
              <p className="mt-6 text-sm font-medium text-text">What happens next</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-text-muted">
                <li>A free conversation comes first.</li>
                <li>The engagement is scoped and priced in writing before work starts.</li>
                <li>The Build runs inside its 10-hour cap, evenings and weekends; the Retainer keeps improving it month to month.</li>
              </ol>
              <p className="mt-8">
                <Link href="/contact" className="font-medium text-honey-text underline-offset-4 hover:underline">
                  Ask about Concierge
                </Link>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <div id="ai-workspace">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-text">Beyond Concierge</p>
            <h2 className="mt-4 text-3xl font-bold text-text">AI Workspace</h2>
            <p className="mt-4 text-4xl font-bold text-text">$10,000</p>
            <p className="mt-1 text-sm text-text-muted">Setup is priced in writing from $7,000. The full Workspace price is $10,000, with a 9-hour labor cap, never discounted.</p>
            <p className="mt-4 text-[15px] text-text-muted">The Workspace puts the whole operation on one system: your site, your customer records, your follow-up, and your day-to-day tools, scoped in writing before any work begins. Most businesses are served completely by the tiers below this one. The Workspace exists for the operation that has outgrown them.</p>
            <p className="mt-4 text-[15px] text-text-muted">Built for multi-location and operations-heavy businesses whose work no longer fits a single site.</p>
            <p className="mt-6 text-sm font-medium text-text">What happens next</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-text-muted">
              <li>A free conversation comes first.</li>
              <li>The scope is written and priced in writing before work starts.</li>
              <li>Setup runs inside its 9-hour labor cap.</li>
            </ol>
            <p className="mt-8">
              <Link href="/contact" className="font-medium text-honey-text underline-offset-4 hover:underline">
                Ask about the Workspace
              </Link>
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="text-2xl font-bold text-text">The tiers, side by side</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[15px] text-text-muted">
              <thead>
                <tr className="text-left"><th scope="col" className="py-3 pr-4 font-semibold text-text"> </th><th scope="col" className="px-4 py-3 font-semibold text-text">Tier 1 · Self-Hosted</th><th scope="col" className="px-4 py-3 font-semibold text-text">Tier 2 · Hosted DIY</th><th scope="col" className="py-3 pl-4 font-semibold text-text">Tier 3 · Concierge</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">Price</th><td className="px-4 py-3">$0 forever</td><td className="px-4 py-3">Launch $29/mo, Growth $59/mo</td><td className="py-3 pl-4">Build $2,500 fixed, Retainer $1,250/mo</td></tr>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">1:1 owner time</th><td className="px-4 py-3">None</td><td className="px-4 py-3">None, ever</td><td className="py-3 pl-4">Capped: 10 hours per Build, 5 per Retainer month</td></tr>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">Support</th><td className="px-4 py-3">Community support</td><td className="px-4 py-3">Async tickets, next business day target</td><td className="py-3 pl-4">Inside the capped hours; the Retainer adds a monthly performance review</td></tr>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">Ticket caps</th><td className="px-4 py-3">No tickets</td><td className="px-4 py-3">3 per month on Launch, 6 on Growth</td><td className="py-3 pl-4">No tickets; capped owner hours instead</td></tr>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">Annual and discount terms</th><td className="px-4 py-3">Free forever</td><td className="px-4 py-3">Annual is two months free, never deeper</td><td className="py-3 pl-4">Never discounted</td></tr>
                <tr className="border-t border-border"><th scope="row" className="py-3 pr-4 text-left font-medium text-text">Getting started</th><td className="px-4 py-3">Take the open core and the library</td><td className="px-4 py-3">Start from the contact form</td><td className="py-3 pl-4">A free conversation first</td></tr>
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      <Section className="bg-surface-2">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">How pricing works here</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p><span className="font-semibold text-text">Overage is prepaid.</span> When capacity fills, the waitlist absorbs demand, not the calendar.</p>
            <p><span className="font-semibold text-text">The DIY tier never gets 1:1 owner time.</span> Support is async, content-first, and ticket-capped. A question asked twice becomes a published playbook entry, not a longer ticket thread.</p>
            <p><span className="font-semibold text-text">Annual is two months free, about 17%, and never deeper.</span> No coupon stacking, no lifetime deals. Annual prepay funds content production and lowers churn work; it is not a growth bribe.</p>
            <p><span className="font-semibold text-text">Each tier pays its own way.</span> Self-Hosted is distribution and is measured on the conversions it creates. Hosted DIY holds software margins only while its support minutes hold. Concierge never subsidizes the DIY price.</p>
            <p><span className="font-semibold text-text">The proof is public.</span> The evals, costs, and counters behind these prices live on the <Link href="/open" className="font-medium text-honey-text underline-offset-4 hover:underline">open pages</Link>, so the diligence happens before the first conversation, not during it.</p>
          </div>
        </Container>
      </Section>


      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Your records stay yours</h2>
          <p className="mt-6 text-text-muted">Your content and your data are yours. Everything on your site is stored as your own records, and you can export all of it, in full, at any time.</p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Comparing your options</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              The honest side-by-side with the other two ways of getting a website is on the{" "}
              <Link href="/compare" className="font-medium text-honey-text underline-offset-4 hover:underline">comparison page</Link>:
              PingFyd against a DIY builder and a local agency, on who does the work, the published
              prices, and the follow-up each one includes.
            </p>
            <p>
              The full price walk-through, with year-one totals for each path, is on the{" "}
              <Link href="/cost" className="font-medium text-honey-text underline-offset-4 hover:underline">cost guide</Link>.
            </p>
          </div>
        </Container>
      </Section>

      <FaqSection items={BUYING_FAQ_ITEMS} eyebrow="Buying questions" title="Buying questions, answered plainly" containerClassName="max-w-4xl" />
    </>
  );
}
