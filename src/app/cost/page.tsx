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
  "The three real options priced in the open: a DIY builder at $19 to $99 a month, a local agency at $699 to $2,500 plus care, and PingFyd's locked tiers.";

export const metadata: Metadata = {
  title: "What a Website Costs a Home Service Business",
  description: DESCRIPTION,
  alternates: { canonical: "/cost" },
  openGraph: {
    type: "website",
    title: "What a Website Costs a Home Service Business",
    description: DESCRIPTION,
    url: siteUrl + "/cost",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "What a Website Costs a Home Service Business",
    description: DESCRIPTION,
  },
};

export default function CostPage() {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Cost", url: siteUrl + "/cost" },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Section>
        <Container className="max-w-4xl">
          <h1 className="text-3xl font-bold text-text">What does a website and follow-up system cost a home service business?</h1>
          <p className="mt-4 text-text-muted">
            The short answer: somewhere between $0 and about $3,700 in the first year, depending on who
            does the work. A DIY builder runs about $230 to $1,190 a year for the platform alone. A
            local agency build with a care plan lands around $1,650 to $3,690 in year one. PingFyd
            runs $0 self-hosted, $348 or $708 a year hosted, or a $2,500 fixed build. The walk-through
            below shows every figure and where it comes from.
          </p>
        </Container>
      </Section>

      <Section className="bg-surface-2">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Option one: the DIY builder</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              Platforms like Wix, Squarespace, GoDaddy, and Durable rent you the tools and the hosting.
              Squarespace's published plans, read on 2026-11-23, run $19 to $99 a month billed yearly,
              which is $228 to $1,188 a year. The cash price is the small part: every page, photo, and
              price change is your time, and follow-up on the inquiries the site produces is a separate
              system you build and run yourself.
            </p>
          </div>
          <h2 className="mt-10 text-2xl font-bold text-text">Option two: the local agency</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              Grand Junction's published anchors, read the same day: Poli Designs lists starter sites
              from $699 and growth sites from $1,299, with a care plan at $79 a month. Kiniston Design
              lists custom websites from $2,500 and managed hosting and support from $99 a month. A
              wider local check, Mesa Valley Marketing's cost guide built from 20 local firms, puts
              complete custom sites between $249 and $1,995, care at $199 a month, and local search
              work at $679 a month. Agency year one, build plus twelve months of care, works out to
              about $1,647 on the starter path ($699 plus 12 times $79) and about $3,688 on the custom
              path ($2,500 plus 12 times $99).
            </p>
          </div>
          <h2 className="mt-10 text-2xl font-bold text-text">Option three: PingFyd</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              The tiers are published and locked. Self-Hosted is $0 forever: the open core and the
              library, on your hosting. Hosted DIY is $29 a month for Launch or $59 for Growth, which
              is $348 or $708 a year with hosting and the inquiry inbox included, support by ticket.
              Concierge is a $2,500 fixed Build, capped at 10 owner hours, with an optional Retainer
              at $1,250 a month for up to 5 hours after. There are no discounts at any tier, and the
              full breakdown sits on the{" "}
              <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">pricing page</Link>.
            </p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">The number that matters</h2>
          <div className="mt-6 space-y-4 text-text-muted">
            <p>
              Compare year-one totals, not headline prices: about $230 to $1,190 for the DIY platform
              before your hours, about $1,650 to $3,690 for the agency path, $0 to $708 for PingFyd
              self-run, and $2,500 once for the Concierge build. Then ask the second question: which
              option answers, attributes, and remembers the inquiries the site produces? That follow-up
              system is included in every PingFyd tier and is an extra build, or an extra hire, on the
              other two paths.
            </p>
            <p>
              The side-by-side table is on the{" "}
              <Link href="/compare" className="font-medium text-honey-text underline-offset-4 hover:underline">comparison page</Link>,
              and the tier facts themselves are on the{" "}
              <Link href="/tiers" className="font-medium text-honey-text underline-offset-4 hover:underline">pricing page</Link>.
              Competitor and local figures are published prices read on 2026-11-23; prices change and
              each seller's own page governs.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
