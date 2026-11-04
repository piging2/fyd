/**
 * [Build My FYD] intake route (Track F, 2026-09-25).
 * New route only; the other lane's src/app/build/[siteId]/page.tsx is untouched.
 */

import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-config";
import BuildMyFydClient from "./build-my-fyd-client";
import { FaqSection } from "@/components/faq-section";
import { getFaqsByCategory } from "@/lib/faq";

const tenant = getTenant();
const siteUrl =
  tenant.domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

const TITLE = "Build My FYD";
const DESCRIPTION =
  "Give us your website. FYD discovers it, reads the real pages, understands the business, checks the facts against evidence, and generates your presence.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/build-my-fyd" },
  openGraph: {
    type: "website",
    title: TITLE + " · PING",
    description: DESCRIPTION,
    url: siteUrl + "/build-my-fyd",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: TITLE + " · PING",
    description: DESCRIPTION,
  },
};

const HOW_STEPS: { name: string; detail: string }[] = [
  {
    name: "Give us your website",
    detail:
      "You provide your website URL. Social profiles are optional, one per line, and documents are optional too. Document names are recorded at intake; document parsing is not wired in this build, so the build uses your website and socials only. No templates, no fonts, no page picking: the owner never configures the build.",
  },
  {
    name: "Discovering presence",
    detail: "FYD discovers your website, the starting point you gave it above.",
  },
  {
    name: "Reading your website",
    detail: "FYD acquires and reads the real pages, not a description of them.",
  },
  {
    name: "Understanding your business",
    detail:
      "FYD builds a model of your business as connected things: services, locations, people, offers, projects, and how they relate. Not page text: actual things.",
  },
  {
    name: "Checking facts against evidence",
    detail: "FYD checks the facts against evidence and resolves them into a verified object graph.",
  },
  {
    name: "Building your FYD",
    detail:
      "FYD generates your presence from that understanding. Your website and customer-facing answers come from the understanding, so they stay consistent with each other.",
  },
];

export default function BuildMyFydPage() {
  return (
    <>
      <BuildMyFydClient />
      <section className="mx-auto max-w-2xl px-6 pb-12">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <p className="mt-2 text-neutral-600">
          The form above is the whole starting point. From there the build runs the same stages
          you watch report in under Build progress:
        </p>
        <ol className="mt-6 space-y-4">
          {HOW_STEPS.map((s, i) => (
            <li key={s.name} className="rounded border border-neutral-200 p-4">
              <h3 className="font-mono text-sm font-semibold">
                {String(i + 1).padStart(2, "0")} · {s.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-600">{s.detail}</p>
            </li>
          ))}
        </ol>
        <h3 className="mt-8 text-lg font-bold tracking-tight">After you submit</h3>
        <p className="mt-2 text-neutral-600">
          Each stage reports in as the build runs. When the build finishes, you are taken to its
          job page, which shows the build report and, when the build is renderable, your generated
          FYD presence, with its objects, relationships, and pages. FYD fails closed: it will not
          show you a presence built from unreachable, unreadable, or disallowed sources.
        </p>
      </section>
      <FaqSection items={getFaqsByCategory("PING Social")} eyebrow="FAQ" title="Questions from business owners" containerClassName="max-w-5xl" align="center" />
    </>
  );
}
