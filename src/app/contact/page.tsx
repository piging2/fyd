import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { PingWordmark } from "@/components/ping-wordmark";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact PING Social about AI concierge and business automation for your business.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const tenant = getTenant();

  return (
    <>
      <Section className="bg-deep">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <PingWordmark />
            </div>
            <SectionHeading
              eyebrow={<span className="text-honey">Contact</span>}
              title={<span className="text-text-on-dark">Let&apos;s talk about your business</span>}
              description={<span className="text-text-on-dark/90">PING Social is a consultancy, not a software signup. Tell us how your business runs and we will tell you honestly whether AI can help, and where.</span>}
              descriptionColor="text-text-on-dark/90"
            />
            <dl className="mt-8 space-y-4 text-text-on-dark">
              {tenant.contact.facebook && (
                <div>
                  <dt className="text-sm font-semibold uppercase text-honey">Facebook</dt>
                  <dd>
                    <a href={tenant.contact.facebook} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-text-on-dark hover:text-honey">
                      {tenant.operator.business} on Facebook
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-semibold uppercase text-honey">Operator</dt>
                <dd className="text-lg text-text-on-dark">{tenant.operator.name}, {tenant.operator.role}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold uppercase text-honey">What to expect</dt>
                <dd className="text-lg text-text-on-dark">A conversation about your workflow first. Recommendations second. No pitch decks, no pressure.</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted p-8">
            <h2 className="text-xl font-bold text-text-on-dark" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>Start with the newsletter</h2>
            <p className="measure mt-2 text-text-on-dark" style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}>
              The PING newsletter covers continuity, agents, and practical business automation. One email when there is something worth saying.
            </p>
            <a
              href="/newsletter"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 font-semibold text-text transition-colors hover:bg-primary-hover"
            >
              Subscribe
            </a>
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
