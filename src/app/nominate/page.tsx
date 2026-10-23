import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";
import { NominateForm } from "./nominate-form";

const tenant = getTenant();
const siteUrl =
  tenant.domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://ping.vercel.app");

const TITLE = "Nominate a business for a PING feature";
const DESCRIPTION =
  "Nominate a business for a PING feature: the skilled tradespeople and knowledge workers of Western Colorado, nominated by the customers who know their work best.";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594275542163";

const OG_IMAGES = [
  { url: "/brand/og-card.png", width: 1200, height: 630, alt: "PING Social" },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/nominate" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl + "/nominate",
    images: OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/og-card.png"],
  },
};

export default function NominatePage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">
            /nominate
          </p>
          <h1
            className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl"
            style={{
              lineHeight: "var(--leading-display)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            Nominate a business for a PING feature.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg text-text-on-dark/90"
            style={{ lineHeight: "var(--leading-body)" }}
          >
            Somebody out there earned it: the plumber who saved your weekend,
            the shop that treated you right, the crew whose work you would
            trust again. Nominate them. Nominations are how the Top Ranked
            Skilled Tradespeople of Western Colorado and Top Ranked Knowledge
            Workers of Western Colorado groups find the businesses worth
            featuring.
          </p>
          <div className="mt-6 max-w-2xl space-y-4 text-text-on-dark/80">
            <p>
              You do not need to own a business to nominate one. Customers,
              fans, neighbors, and other businesses all count: a nomination is
              a counted record, and the business is invited to apply or
              confirm before anything public happens.
            </p>
            <p>
              Rather message us?{" "}
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-honey hover:underline"
              >
                Message PING on Facebook
              </a>
              .
            </p>
          </div>
        </Container>
      </Section>

      <Section size="minor">
        <Container className="max-w-3xl">
          <h2 className="text-2xl font-bold text-text">The nomination</h2>
          <p className="mt-2 text-text-muted">
            Tell us who, where, and why. Your words are the nomination.
          </p>
          <div className="mt-8">
            <NominateForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
