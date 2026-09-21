import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";
import { NewsletterSignup } from "@/components/newsletter-signup";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Follow the PING build: notes on continuity, agents, business systems, and building in public.",
  alternates: { canonical: "/newsletter" },
};

export default function NewsletterPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Newsletter</span>}
            title={<span className="text-text-on-dark">Follow the build</span>}
            description={<span className="text-text-on-dark/90">Notes on continuity, agents, business systems, and building PING. One email when there is something worth saying. No spam, no fluff.</span>}
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-2xl">
          <div className="rounded-lg border border-border-soft bg-surface p-8">
            <h2 className="text-xl font-bold text-text">Get the notes</h2>
            <p className="mt-2 text-text-muted">
              Architecture decisions, implementation lessons, and practical automation thinking. Straight from the build.
            </p>
            <div className="mt-6">
              <NewsletterSignup />
            </div>
          </div>

          <div className="mt-8 rounded-lg bg-surface-muted p-8 text-center">
            <h3 className="text-lg font-bold text-text">Archive</h3>
            <p className="mt-2 text-text-muted">
              The first issue is being written. Past notes will appear here as they are published.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
