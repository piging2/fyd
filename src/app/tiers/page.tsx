import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container, Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import { buildItemListJsonLd } from "@/lib/structured-data";
import { getTenant } from "@/lib/tenant-config";
import { cn } from "@/lib/utils";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing: Self-Hosted $0, Hosted DIY from $29/mo, Concierge from $2,500 | PingFyd",
  description:
    "Three tiers, priced in the open with the logic published: Self-Hosted free forever, Hosted DIY Launch $29/mo and Growth $59/mo with ticket caps and zero 1:1 owner time, Concierge Builds at $2,500 fixed and Retainers at $1,250/mo with capped owner hours.",
  alternates: { canonical: "/tiers" },
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
  const base = tenant.domain ?? "https://fyd-product.vercel.app";
  const itemListJsonLd = buildItemListJsonLd([
    { name: "Self-Hosted", url: base + "/tiers#self-hosted" },
    { name: "Hosted DIY", url: base + "/tiers#hosted" },
    { name: "Concierge", url: base + "/tiers#concierge" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em]"><span className="text-honey">Pricing</span></p>
          <h1 className="mt-4 font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            Three tiers. Priced in the open.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            The prices are below, and so is the logic that produced them. Owner time is the scarce
            resource in this business, so it is priced like one: a $200 per hour floor, packages
            built to realize $250, hours capped in writing, and no discounting, ever.
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid md:grid-cols-3">
            <div id="self-hosted" className="md:pr-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text">Tier 1 · Self-Hosted</h2>
              <p className="mt-4 text-4xl font-bold text-text">$0</p>
              <p className="mt-1 text-sm text-text-muted">Forever. No license fee, no per-seat fee. You run it, you host it.</p>
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
                additional sites $15/site/mo.
              </p>
              <p className="mt-6 text-sm font-medium text-text">Everything in Self-Hosted, plus:</p>
              <List items={[
                "Managed hosting: uptime, backups, updates, and security patches handled",
                "Your site generated from your verified profile, with an editing surface you control",
                "FYD objects with attribution: views, clicks, and inquiries kept distinct",
                "Lead inbox with notifications, a custom domain, and a verified business profile",
                "The Build-in-Open Library as your onboarding: playbooks, templates, checklists, and self-serve evals",
                "Async ticket support, next business day target: 3 tickets/mo on Launch, 6 on Growth",
              ]} />
              <p className="mt-6 text-[15px] text-text-muted">
                Growth adds advanced attribution and a priority support queue. One boundary holds at
                both levels: <span className="font-medium text-text">zero 1:1 owner time, ever.</span>{" "}
                No done-for-you work, no phone support, no guaranteed leads or rankings.
              </p>
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
              <List items={[
                "Concierge Build, $2,500 fixed: profile, site finished by hand where it matters, offer written with you, objects placed, lead flow tested end to end",
                "Build hours capped at 10 owner hours, logged and visible to you; at the cap, work stops or converts, never silently overflows",
                "Concierge Retainer, $1,250/mo: up to 5 owner hours a month for iteration, campaign adjustments, and a monthly performance review",
                "Overage is prepaid only: $250/hr, or extra time in prepaid 5-hour blocks at $1,250. Unused retainer hours expire monthly",
              ]} />
              <p className="mt-6 text-[15px] text-text-muted">
                Capacity, stated rather than implied: concierge work is delivered in evenings and
                weekends, because school hours are school hours. Slots are limited. When capacity is
                full, a waitlist holds your place with a $500 deposit, credited in full against your
                first package.
              </p>
              <p className="mt-8">
                <Link href="/contact" className="font-medium text-honey-text underline-offset-4 hover:underline">
                  Ask about Concierge
                </Link>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="bg-surface-2">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">How pricing works here</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p><span className="font-semibold text-text">Concierge is never discounted and never overflows.</span> The rate floor is $200 per owner hour; packages are built so full use realizes $250. Overage is prepaid. When capacity fills, the waitlist absorbs demand, not the calendar.</p>
            <p><span className="font-semibold text-text">The DIY tier never gets 1:1 owner time.</span> Support is async, content-first, and ticket-capped. A question asked twice becomes a published playbook entry, not a longer ticket thread.</p>
            <p><span className="font-semibold text-text">Annual is two months free, about 17%, and never deeper.</span> No coupon stacking, no lifetime deals. Annual prepay funds content production and lowers churn work; it is not a growth bribe.</p>
            <p><span className="font-semibold text-text">Each tier pays its own way.</span> Self-Hosted is distribution and is measured on the conversions it creates. Hosted DIY holds software margins only while its support minutes hold. Concierge never subsidizes the DIY price.</p>
            <p><span className="font-semibold text-text">The proof is public.</span> The evals, costs, and counters behind these prices live on the <Link href="/open" className="font-medium text-honey-text underline-offset-4 hover:underline">open pages</Link>, so the diligence happens before the first conversation, not during it.</p>
          </div>
        </Container>
      </Section>
    </>
  );
}
