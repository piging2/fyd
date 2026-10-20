import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";
import { ApplyForm } from "./apply-form";

const tenant = getTenant();
const siteUrl =
  tenant.domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://ping.vercel.app");

const TITLE = "Apply to be considered for a feature";
const DESCRIPTION =
  "Apply to be considered for a PING feature: exceptional skilled trades and knowledge worker businesses across Western Colorado, in the Top Ranked groups.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/apply" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl + "/apply",
    images: [{ url: "/brand/og-card.png", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.png"],
    title: TITLE,
    description: DESCRIPTION,
  },
};

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594275542163";

export default function ApplyPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">
            /featured
          </p>
          <h1
            className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl"
            style={{
              lineHeight: "var(--leading-display)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            Inspired by the best of the best.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg text-text-on-dark/90"
            style={{ lineHeight: "var(--leading-body)" }}
          >
            We spotlight exceptional Western Colorado businesses, the people
            behind them, and the work that makes their communities stronger.
          </p>
          <div className="mt-6 max-w-2xl space-y-4 text-text-on-dark/80">
            <p>
              Being featured means a spotlight in the Top Ranked Skilled Tradespeople
              of Western Colorado or the Top Ranked Knowledge Workers of Western
              Colorado group, and on PING&apos;s pages.
              It is recognition for businesses whose work speaks for itself.
            </p>
            <p>
              Applying is free. No ranking is sold, and no placement is
              guaranteed: applications are reviewed by PING, and selection is
              not promised.
            </p>
            <p>
              The form below is the application path for your own business.
              Know a business that deserves a spotlight instead?{" "}
              <a href="/nominate" className="font-semibold text-honey hover:underline">
                Nominate a business for a PING feature.
              </a>
              : nominating is how you point us to a business you admire.
            </p>
          </div>
        </Container>
      </Section>

      <Section size="minor">
        <Container className="max-w-3xl">
          <h2 className="text-2xl font-bold text-text">The application</h2>
          <p className="mt-2 text-text-muted">
            Tell us about the business. Strong, specific answers help an
            application stand out.
          </p>
          <div className="mt-8">
            <ApplyForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
