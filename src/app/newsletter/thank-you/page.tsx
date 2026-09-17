import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { PingWordmark } from "@/components/ping-wordmark";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "Newsletter Subscription Confirmed",
  description: "You are subscribed to the PING newsletter: continuity, agents, and practical business automation.",
  alternates: { canonical: "/newsletter/thank-you" },
};

export default function NewsletterThankYouPage() {
  const tenant = getTenant();

  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-3xl text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <PingWordmark />
          </div>
          <SectionHeading
            eyebrow={<span className="text-honey">You&apos;re in!</span>}
            title={<span className="text-text-on-dark">Welcome to the PING newsletter</span>}
            description={<span className="text-text-on-dark/90">Check your inbox for a confirmation email. You will hear from us when there is something worth saying: architecture notes, implementation lessons, and practical automation thinking.</span>}
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-3xl">
          <div className="prose prose-lg mx-auto">
            <h3>What you will receive:</h3>
            <ul>
              <li><strong>Architecture notes</strong> — how PING&apos;s continuity, evidence, and replay systems actually work</li>
              <li><strong>Implementation lessons</strong> — what building agent infrastructure teaches</li>
              <li><strong>Practical automation</strong> — what works for real businesses, what does not</li>
            </ul>

            <h3>Explore more:</h3>
            <p>
              Read <Link href="/technology" className="text-honey hover:underline">how PING works</Link>, or
              browse the <Link href="/blog" className="text-honey hover:underline">blog</Link> for
              implementation notes.
            </p>

            <h3>Want help with your business?</h3>
            <p>
              {tenant.operator.business} works directly with home service businesses on AI concierge
              and automation. Start with a conversation, not a signup form.
            </p>

            <div className="mt-8">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-lg bg-honey px-8 py-4 font-semibold text-deep transition-colors hover:bg-honey/90"
              >
                Contact {tenant.operator.business}
              </Link>
            </div>
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
