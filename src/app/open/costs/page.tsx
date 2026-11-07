import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/section";
import { DiyCalculator } from "@/components/diy-calculator";
import { diyCostLines, ownCostShape } from "@/lib/open-data";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "What It Costs to Run This: DIY Cost Physics and Calculator | PingFyd Open",
  description:
    "The real cost of running a small business web, social, and AI stack yourself, line by line, with an interactive true-cost calculator that prices your own hours. Estimates labeled, unknowns admitted.",
  alternates: { canonical: "/open/costs" },
};

export default function CostsPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em]"><span className="text-honey">Open · Costs</span></p>
          <h1 className="mt-4 font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            The math is the pitch.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            Doing it yourself is not free; it is priced in hours instead of dollars. Here is the
            cost structure of the stack, line by line, and a calculator that runs your own numbers.
            Dollar lines are typical list-price ranges and are labeled estimates. The time line is
            yours to price.
          </p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">The DIY stack, line by line</h2>
          <div className="mt-6">
            {diyCostLines.map((line, i) => (
              <div key={line.item} className={"grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:gap-6 " + (i === 0 ? "" : "border-t border-border")}>
                <div>
                  <p className="font-medium text-text">{line.item}</p>
                  <p className="mt-1 text-sm text-text-muted">{line.note}</p>
                </div>
                <p className="text-lg font-bold text-text sm:text-right">
                  {line.diy}
                  <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">{line.kind}</span>
                </p>
              </div>
            ))}
          </div>

          <h2 className="mt-14 text-2xl font-bold text-text">Run your numbers</h2>
          <p className="mt-3 max-w-2xl text-text-muted">
            Set your hours and your rate honestly. Most owners have never priced the first line, and
            it is larger than every subscription they pay.
          </p>
          <div className="mt-6">
            <DiyCalculator />
          </div>

          <h2 className="mt-14 text-2xl font-bold text-text">Our own cost shape</h2>
          <div className="mt-4 rounded-2xl border border-border bg-surface p-6">
            <p className="font-display text-3xl font-bold text-text">UNKNOWN</p>
            <p className="mt-2 max-w-2xl text-text-muted">{ownCostShape.note}</p>
          </div>

          <p className="mt-10 text-text-muted">
            Where each tier lands against these numbers is on{" "}
            <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">
              the tiers page
            </Link>
            , with the pricing logic published next to the prices.
          </p>
        </Container>
      </Section>
    </>
  );
}
