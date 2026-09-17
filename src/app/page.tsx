import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { PingWordmark } from "@/components/ping-wordmark";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "PING — Continuity infrastructure for AI agents",
  description: "PING is an evolving intelligence system: continuity, agent infrastructure, evidence and provenance, for AI agents and the businesses they serve.",
  alternates: { canonical: "/" },
};

const concepts = [
  {
    title: "Continuity",
    text: "Most AI starts from zero every session. PING is built to remember: events are recorded, knowledge accumulates, and context survives across sessions, agents, and days.",
    href: "/technology",
  },
  {
    title: "Agents",
    text: "Software that acts on your behalf needs boundaries: what it may touch, what it may change, and where it must stop and ask. PING defines agent infrastructure with explicit capability boundaries.",
    href: "/technology",
  },
  {
    title: "Evidence",
    text: "Every claim traces back to its source. Observations carry provenance, verification status, and confidence. A result you cannot explain is not a result you can trust.",
    href: "/technology",
  },
  {
    title: "Replay",
    text: "Important behavior must be explainable after the fact: what happened, why, which version decided, and whether the replay matches. Deterministic where determinism matters.",
    href: "/technology",
  },
];

const buildNotes = [
  {
    title: "From HPP to PING",
    text: "This site was rebuilt from a trades-company website into the first tenant of the TenantOS platform model. The transformation itself is the proof of concept.",
    href: "/blog",
  },
  {
    title: "Execution boundaries for agents",
    text: "How agents run commands across machine boundaries without corrupting them, and why capability separation matters more than clever prompting.",
    href: "/blog",
  },
  {
    title: "Evidence before eloquence",
    text: "Autonomous systems should prefer a correct, well-supported answer over an impressive one. What that principle costs in practice.",
    href: "/blog",
  },
];

export default function HomePage() {
  const tenant = getTenant();
  return (
    <>
      {/* Hero */}
      <Section className="bg-deep">
        <Container className="max-w-4xl text-center">
          <ScrollReveal>
            <div className="mb-6 flex justify-center">
              <PingWordmark className="scale-150" />
            </div>
            <p className="text-lg font-medium text-honey">{tenant.tagline}</p>
            <h1 className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>
              Systems that remember,<br />agents you can trust
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-text-on-dark/90" style={{ lineHeight: 'var(--leading-body)' }}>
              PING turns information into reliable understanding, understanding into useful action,
              and action into evidence that can be trusted and replayed. Built for AI agents and
              the real businesses they serve.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/technology"
                className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
              >
                How PING works
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center rounded-full border border-text-on-dark/30 px-8 font-semibold text-text-on-dark transition-colors hover:bg-text-on-dark/10"
              >
                Work with {tenant.operator.business}
              </Link>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* What PING is */}
      <Section>
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="What PING is"
            title="Continuity plus agents plus business infrastructure"
            description="Not a chatbot. Not a demo. An intelligence system designed around a single hard problem: making autonomous systems reliable enough to trust with real work."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {concepts.map((c) => (
              <ScrollReveal key={c.title}>
                <article className="h-full rounded-lg border border-border-soft bg-surface p-6">
                  <h3 className="text-xl font-bold text-text">{c.title}</h3>
                  <p className="mt-2 text-text-muted">{c.text}</p>
                  <Link href={c.href} className="mt-4 inline-block font-medium text-honey hover:underline">
                    Learn more →
                  </Link>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* PING Social */}
      <Section className="bg-surface-2">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={tenant.operator.business}
            title="Practical AI for real businesses"
            description="The consultancy arm. Nolan Geske works with home service businesses to put AI to practical use: capture more opportunities, reduce administrative drag, respond faster, operate more consistently."
          />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="font-bold text-text">Fewer missed opportunities</h3>
              <p className="mt-2 text-sm text-text-muted">Missed calls, slow follow-up, and scheduling friction are where revenue quietly leaks. Automation plugs the leaks.</p>
            </div>
            <div className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="font-bold text-text">Less busywork</h3>
              <p className="mt-2 text-sm text-text-muted">Repetitive communication, organization, and follow-up handled reliably, so people focus on customers and jobs.</p>
            </div>
            <div className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="font-bold text-text">Humans in control</h3>
              <p className="mt-2 text-sm text-text-muted">Automation supports owners and skilled workers. It does not replace their judgment.</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 font-semibold text-text transition-colors hover:bg-primary-hover"
            >
              Start a conversation
            </Link>
          </div>
        </Container>
      </Section>

      {/* From the build */}
      <Section>
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="From the build"
            title="Implementation notes, not marketing"
            description="The blog documents what building this actually teaches. Real architecture decisions, real trade-offs."
          />
          <div className="mt-10 space-y-6">
            {buildNotes.map((b) => (
              <article key={b.title} className="rounded-lg border border-border-soft bg-surface p-6">
                <h3 className="text-lg font-bold text-text">{b.title}</h3>
                <p className="mt-2 text-text-muted">{b.text}</p>
                <Link href={b.href} className="mt-3 inline-block font-medium text-honey hover:underline">
                  Read the blog →
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      {/* Newsletter */}
      <Section className="bg-deep">
        <Container className="max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-text-on-dark">The PING newsletter</h2>
          <p className="mt-3 text-text-on-dark/90">
            Architecture notes and implementation lessons. One email when there is something worth saying.
          </p>
          <div className="mt-6">
            <NewsletterSignup />
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
