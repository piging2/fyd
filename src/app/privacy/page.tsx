import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PING collects and uses information provided through subscriptions, contact, site forms, and FYD build requests, and never sells your information.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    title: "Privacy Policy · PING",
    description: "How PING collects and uses information provided through subscriptions, contact, site forms, and FYD build requests, and never sells your information.",
    url: siteUrl + "/privacy",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "Privacy Policy · PING",
    description: "How PING collects and uses information provided through subscriptions, contact, site forms, and FYD build requests, and never sells your information.",
  },
};

export default function PrivacyPage() {
  const tenant = getTenant();

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="text-3xl font-bold text-text">Privacy Policy</h1>
        <p className="mt-4 text-sm text-text-subtle">Last updated: November 3, 2026</p>
        <section className="mt-8 rounded-lg border border-border-soft bg-surface p-6">
          <h2 className="text-xl font-bold text-text">The short version</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-text-muted">
            <li>
              <strong className="text-text">What this site collects:</strong> when you subscribe
              to the newsletter, contact {tenant.operator.business}, submit a site form, or start
              a FYD build request, it collects the information you provide: your name, contact
              details, business and website details, and the contents of your submission.
            </li>
            <li>
              <strong className="text-text">Why:</strong> your information is used to respond to
              you, to review and act on the request you submitted, and to send the newsletter you
              asked for.
            </li>
            <li>
              <strong className="text-text">Shared or sold:</strong> your information is not sold,
              and it is shared only with the service providers needed to operate this site,
              process your request, and deliver the newsletter.
            </li>
            <li>
              <strong className="text-text">Analytics:</strong> this site does not run analytics
              trackers beyond what the hosting platform provides.
            </li>
            <li>
              <strong className="text-text">Asking about your data:</strong> questions about your
              data? Reach {tenant.operator.business} through the{" "}
              <a href="/contact" className="text-honey-text hover:underline">contact page</a>.
            </li>
          </ul>
        </section>
        <div className="mt-8 space-y-6 text-text-muted">
          <section>
            <h2 className="text-xl font-bold text-text">Information we collect</h2>
            <p className="mt-2">
              When you subscribe to the newsletter, contact {tenant.operator.business}, submit a
              site form, or start a FYD build request, we collect the information you provide:
              your name, contact details, business and website details, and the contents of your
              submission. This site does not run analytics trackers beyond what the hosting platform
              provides.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-text">How we use it</h2>
            <p className="mt-2">
              We use your information to respond to you, review and act on the request you
              submitted, and send the newsletter you asked for. We do not sell your information.
              We share it only with the service providers needed to operate this site, process
              your request, and deliver the newsletter.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-text">Contact</h2>
            <p className="mt-2">
              Questions about your data? Reach {tenant.operator.business} through the{" "}
              <a href="/contact" className="text-honey-text hover:underline">contact page</a>.
            </p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
