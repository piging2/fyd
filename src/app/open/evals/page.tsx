import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import Link from "next/link";
import { Container, Section } from "@/components/section";
import { evalGates } from "@/lib/open-data";

export const dynamic = "force-static";
export const revalidate = 3600;

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

export const metadata: Metadata = {
  title: "Evals and Gates: The Tests Our Work Must Pass | PingFyd Open",
  description:
    "The standing evaluation gates behind PingFyd's work, published: what each gate tests, its current pass state, and its trend, including the failures that created it. Provenance on every entry.",
  alternates: { canonical: "/open/evals" },
  openGraph: {
    type: "website",
    title: "Evals and Gates: The Tests Our Work Must Pass | PingFyd Open",
    description: "The standing evaluation gates behind PingFyd's work, published: what each gate tests, its current pass state, and its trend, including the failures that created it. Provenance on every entry.",
    url: siteUrl + "/open/evals",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "Evals and Gates: The Tests Our Work Must Pass | PingFyd Open",
    description: "The standing evaluation gates behind PingFyd's work, published: what each gate tests, its current pass state, and its trend, including the failures that created it. Provenance on every entry.",
  },
};

export default function EvalsPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em]"><span className="text-honey">Open · Evals</span></p>
          <h1 className="mt-4 font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            Publish the evals, not adjectives.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-text-on-dark/90">
            Anyone can claim quality. These are the gates our work actually has to pass, with what
            each one tests, where it stands today, and how it got there. The failures are part of
            the record; several of these gates exist because something failed first.
          </p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          {evalGates.map((gate, i) => (
            <article key={gate.name} className={i === 0 ? "pb-10" : "border-t border-border py-10"}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-2xl font-bold text-text">{gate.name}</h2>
                <p className="rounded-full border border-border px-3 py-1 text-sm font-medium text-honey-text">{gate.state}</p>
              </div>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-text">What it tests</h3>
              <p className="mt-2 text-text-muted">{gate.tests}</p>
              <h3 className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-text">Trend</h3>
              <p className="mt-2 text-text-muted">{gate.trend}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-text-muted">
                Source: {gate.source} · As of {gate.asOf}
              </p>
            </article>
          ))}

          <div className="border-t border-border pt-10">
            <p className="text-text-muted">
              The evals are the diligence package for the concierge tier: a prospect who reads three
              of these has already checked our work more deeply than a sales call would allow.{" "}
              <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">
                See how the tiers use them
              </Link>
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
