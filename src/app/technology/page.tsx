import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";

export const metadata: Metadata = {
  title: "Technology",
  description: "How PING actually works: continuity, agents, events, evidence, replay, integrations, social objects, and the TenantOS direction.",
  alternates: { canonical: "/technology" },
};

const topics = [
  {
    slug: "continuity",
    title: "Continuity",
    status: "Documented",
    text: "Systems that remember: events, knowledge, and evidence that survive across sessions, agents, and days.",
  },
  {
    slug: "agents",
    title: "Agents",
    status: "Documented",
    text: "Agent infrastructure with explicit capability boundaries: what an agent may touch, change, and where it must stop.",
  },
  {
    slug: "events",
    title: "Events",
    status: "In development",
    text: "The event plane: how things that happen become canonical, queryable, and replayable records.",
  },
  {
    slug: "evidence",
    title: "Evidence",
    status: "Documented",
    text: "Provenance for autonomous systems: every claim traces to its source, with verification status and confidence.",
  },
  {
    slug: "replay",
    title: "Replay",
    status: "In development",
    text: "Deterministic replay: what happened, why, which version decided, and whether the replay matches.",
  },
  {
    slug: "integrations",
    title: "Integrations",
    status: "In development",
    text: "AI integrations without credential sprawl: one identity per human, repository capabilities for agents, no secret piles.",
  },
  {
    slug: "social-objects",
    title: "Social Objects",
    status: "Direction",
    text: "The shared artifacts that business conversations orbit: posts, pages, and proof that compound over time.",
  },
  {
    slug: "business-automation",
    title: "Business Automation",
    status: "Documented",
    text: "Practical automation for home service businesses: capture, follow-up, and consistency without replacing judgment.",
  },
  {
    slug: "tenantos",
    title: "TenantOS",
    status: "Direction",
    text: "The platform direction this site proves: one codebase, many tenants, configuration over forking.",
  },
];

export default function TechnologyPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Technology</span>}
            title={<span className="text-text-on-dark">How PING actually works</span>}
            description={<span className="text-text-on-dark/90">No hype, no vaporware. Each topic is labeled honestly: documented, in development, or direction. This section doubles as source material for the blog.</span>}
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <div className="grid gap-6 md:grid-cols-2">
            {topics.map((t) => (
              <Link key={t.slug} href={`/technology/${t.slug}`} className="group">
                <article className="h-full rounded-lg border border-border-soft bg-surface p-6 transition-shadow group-hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-text group-hover:text-honey">{t.title}</h2>
                    <span className="rounded bg-honey/10 px-2 py-1 text-xs font-semibold text-honey">{t.status}</span>
                  </div>
                  <p className="mt-2 text-text-muted">{t.text}</p>
                  <span className="mt-4 inline-block font-medium text-honey">Read →</span>
                </article>
              </Link>
            ))}
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
