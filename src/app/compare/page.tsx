import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/section";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
import { getTenant } from "@/lib/tenant-config";

export const dynamic = "force-static";
export const revalidate = 3600;

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

const DESCRIPTION =
  "An honest comparison for home service owners: who does the work, what each option costs in the open, who holds the asset, and what follow-up each includes.";

export const metadata: Metadata = {
  title: "PingFyd vs DIY Builders vs a Local Agency",
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  openGraph: {
    type: "website",
    title: "PingFyd vs DIY Builders vs a Local Agency",
    description: DESCRIPTION,
    url: siteUrl + "/compare",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "PingFyd vs DIY Builders vs a Local Agency",
    description: DESCRIPTION,
  },
};

const ROWS: { label: string; pingfyd: string; diy: string; agency: string }[] = [
  {
    label: "Who does the work",
    pingfyd: "Your choice: run it yourself on the open core, or hand the whole build to the Concierge",
    diy: "You do, inside the builder's editor, in your own hours",
    agency: "The agency does, on their stack and their schedule",
  },
  {
    label: "The price, in the open",
    pingfyd: "$0 self-hosted; $29 or $59 a month hosted; $2,500 fixed for a Concierge Build",
    diy: "Published platform plans run about $19 to $99 a month billed yearly (Squarespace's current range)",
    agency: "Published local anchors: starter sites from $699, custom sites from $2,500",
  },
  {
    label: "Ongoing care",
    pingfyd: "Ticket support on Hosted DIY; an optional Retainer at $1,250 a month, capped at 5 owner hours",
    diy: "Platform support for the tool; the follow-up system is yours to build and run",
    agency: "Care and hosting plans from $79 to $99 a month at the local firms checked",
  },
  {
    label: "Where the site lives",
    pingfyd: "Generated from your structured profile; the self-hosted tier runs on your own hosting at no license cost",
    diy: "On the platform's system, in the platform's formats",
    agency: "On the agency's hosting or yours, depending on the contract you sign",
  },
  {
    label: "Follow-up on new inquiries",
    pingfyd: "Inquiries captured in one inbox with source attribution on Hosted DIY and Concierge",
    diy: "Basic forms are included; tracking and follow-up are up to you",
    agency: "Depends on what the build includes; ask before you sign",
  },
  {
    label: "Getting started",
    pingfyd: "Take the open core today, start Hosted DIY from the contact form, or book the free conversation for Concierge",
    diy: "Pick a plan and start building",
    agency: "A sales conversation and a scoped quote",
  },
];

export default function ComparePage() {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Compare", url: siteUrl + "/compare" },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Section>
        <Container className="max-w-4xl">
          <h1 className="text-3xl font-bold text-text">PingFyd vs a DIY builder vs a local agency</h1>
          <p className="mt-4 text-text-muted">
            A home service owner choosing a website really chooses between three ways of getting one:
            build it yourself on a platform, hire a local agency, or take a system with the follow-up
            machinery built in. This page puts the three side by side on the questions that decide it,
            using published prices only.
          </p>
        </Container>
      </Section>

      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <h2 className="text-2xl font-bold text-text">The three options, side by side</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-text-muted">
              <thead>
                <tr>
                  <th scope="col" className="py-3 pr-4 font-semibold text-text">The question</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-text">PingFyd</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-text">DIY builder</th>
                  <th scope="col" className="py-3 pl-4 font-semibold text-text">Local agency</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <th scope="row" className="py-3 pr-4 text-left font-medium text-text">{r.label}</th>
                    <td className="px-4 py-3">{r.pingfyd}</td>
                    <td className="px-4 py-3">{r.diy}</td>
                    <td className="py-3 pl-4">{r.agency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-text-muted">
            Competitor and local figures are the published prices read on 2026-11-23 from the public
            pages of Squarespace, Poli Designs, and Kiniston Design. Prices change; each seller's own
            page governs. PingFyd figures are the locked tiers on the{" "}
            <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">pricing page</Link>.
          </p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">How to choose, honestly</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              <span className="font-semibold text-text">Choose the DIY builder</span> if you enjoy the
              tools, your site is simple, and follow-up by hand is fine at your volume. It is the
              cheapest cash option and the most expensive in your own hours.
            </p>
            <p>
              <span className="font-semibold text-text">Choose the local agency</span> if you want a
              custom design and a person across town accountable for it, and the build price plus a
              monthly care plan fits. Read the contract for who holds the site and the domain before
              you sign; that term decides what leaving looks like.
            </p>
            <p>
              <span className="font-semibold text-text">Choose PingFyd</span> if the website is only
              half the problem and the other half is inquiries answered, attributed, and remembered.
              That follow-up machinery is the product here, at every tier, including the free one.
            </p>
            <p>
              For the full price walk-through, see{" "}
              <Link href="/cost" className="font-medium text-honey-text underline-offset-4 hover:underline">what a website and follow-up system costs a home service business</Link>.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
