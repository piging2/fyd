import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/section";
import { openCounters } from "@/lib/open-data";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Building in the Open: Live Factory Counters, Evals, and Costs | PingFyd",
  description:
    "PingFyd builds in the open: live factory counters with provenance, the eval gates our work must pass, what the stack costs to run, and the three tiers priced in public. Every number real or labeled.",
};

const cards = [
  {
    href: "/open/evals",
    title: "Evals and gates",
    body: "The standing gates our work must pass: acoustic timing, ship-line verification, tenant isolation, discoverability, content quality, and the wave gates. Current state and trend for each, including the ones that failed first.",
    cta: "Read the evals",
  },
  {
    href: "/open/costs",
    title: "What it costs to run this",
    body: "The cost physics of a small business web, social, and AI stack: what doing it yourself actually costs once your own hours are priced, and an interactive calculator that runs your numbers.",
    cta: "Run your numbers",
  },
  {
    href: "/tiers",
    title: "The three tiers",
    body: "Self-Hosted at $0, Hosted DIY from $29 a month, and Concierge priced off the owner's hours with the caps printed. The pricing logic is published with the prices.",
    cta: "See the tiers",
  },
];

export default function OpenPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.12em]"><span className="text-honey">Building in the open</span></p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            The factory, in the open.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            This page is a proof surface, not a brochure. The counters below are drawn from factory
            records, each labeled with its source and the date it was read. Where a number is an
            estimate it says so. Where we do not know yet, it says UNKNOWN.
          </p>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {openCounters.map((c) => (
              <div key={c.label} className="border-t border-text-on-dark/15 pt-5">
                <p className="font-display text-4xl font-bold text-honey">{c.value}</p>
                <p className="mt-1.5 font-medium text-text-on-dark">{c.label}</p>
                <p className="mt-2 text-sm text-text-on-dark/75">{c.note}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-text-on-dark/50">
                  Source: {c.source} · As of {c.asOf}
                </p>
              </div>
            ))}
            <div className="border-t border-text-on-dark/15 pt-5">
              <p className="font-display text-4xl font-bold text-honey">Under 2 hrs</p>
              <p className="mt-1.5 font-medium text-text-on-dark">weekly human upkeep budget for this section</p>
              <p className="mt-2 text-sm text-text-on-dark/75">
                Every surface here updates from records the factory already produces. A transparency
                page that cannot maintain itself gets cut, not left to rot: a dead open page argues
                against the openness it claims.
              </p>
              <p className="mt-3 text-xs uppercase tracking-wide text-text-on-dark/50">
                Source: the build spec for this section · Standing rule
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 md:grid-cols-3">
            {cards.map((card) => (
              <div key={card.href} className="border-t-2 border-honey pt-5">
                <h2 className="text-xl font-bold text-text">{card.title}</h2>
                <p className="mt-2.5 text-text-muted">{card.body}</p>
                <p className="mt-4">
                  <Link href={card.href} className="font-medium text-honey-text underline-offset-4 hover:underline">
                    {card.cta}
                  </Link>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 border-t border-border pt-10">
            <h2 className="text-2xl font-bold text-text">Three doors, one per tier</h2>
            <div className="mt-6 grid gap-8 md:grid-cols-3">
              <p className="text-text-muted">
                <span className="font-semibold text-text">Do it yourself.</span> The open core, the
                library, and the evals are free, forever. <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">Self-Hosted, $0</Link>
              </p>
              <p className="text-text-muted">
                <span className="font-semibold text-text">We host it.</span> Your site and objects run
                on our infrastructure, guided by the same library. <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">Hosted DIY, from $29/mo</Link>
              </p>
              <p className="text-text-muted">
                <span className="font-semibold text-text">We run it for you.</span> Concierge, priced off
                the owner's hours with the caps printed in advance. <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">Concierge, from $2,500</Link>
              </p>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
