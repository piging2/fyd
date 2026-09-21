import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  SystemTopology,
  TenantModel,
  KnowledgeLoop,
  BusinessGraph,
  AgentAuthority,
  ReplayEvidence,
  MultiRuntime,
} from "@/components/architecture";

export const metadata: Metadata = {
  title: "Technology",
  description: "How PING actually works: system topology, TenantOS, events, knowledge graph, business graph, missions, capability boundaries, workers, evidence, witness, lineage, replay, and multi-runtime execution.",
  alternates: { canonical: "/technology" },
};

const DEEP_DIVES = [
  { slug: "continuity", title: "Continuity", status: "Documented" },
  { slug: "events", title: "Events", status: "In development" },
  { slug: "evidence", title: "Evidence", status: "Documented" },
  { slug: "replay", title: "Replay", status: "In development" },
  { slug: "agents", title: "Agents", status: "Documented" },
  { slug: "tenantos", title: "TenantOS", status: "Direction" },
  { slug: "integrations", title: "Integrations", status: "In development" },
  { slug: "business-automation", title: "Business Automation", status: "Documented" },
  { slug: "social-objects", title: "Social Objects", status: "Direction" },
];

export default function TechnologyPage() {
  return (
    <>
      {/* Header */}
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Technology</span>}
            title={<span className="text-text-on-dark">How PING actually works</span>}
            description={<span className="text-text-on-dark/90">No hype, no vaporware. Each topic is labeled honestly: documented, in development, or direction. Diagrams are architectural models, not marketing illustrations.</span>}
          />
        </Container>
      </Section>

      {/* System topology */}
      <Section>
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="Architecture overview"
            title="System topology"
            description="Five layers. Each has one job. Upper layers depend on lower layers, never the reverse."
          />
          <div className="mt-10">
            <SystemTopology />
          </div>
        </Container>
      </Section>

      {/* TenantOS */}
      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="TenantOS"
            title="One codebase, many tenants"
            description="The platform direction this site proves. Each tenant is configuration plus content plus brand plus domain, never a fork."
            align="center"
          />
          <div className="mt-10">
            <TenantModel />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/tenantos" className="font-medium text-honey hover:underline">
              Read the TenantOS specification →
            </Link>
          </div>
        </Container>
      </Section>

      {/* Knowledge loop */}
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="Canonical events"
            title="The knowledge compounding loop"
            description="Everything PING knows starts as an event. The loop turns raw input into institutional memory."
            align="center"
          />
          <div className="mt-10">
            <KnowledgeLoop />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/events" className="font-medium text-honey hover:underline">
              Read about events →
            </Link>
          </div>
        </Container>
      </Section>

      {/* Business graph */}
      <Section className="bg-deep">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Knowledge graph</span>}
            title={<span className="text-text-on-dark">The business graph</span>}
            description={<span className="text-text-on-dark/80">PING does not merely store documents. It understands relationships between the things a business knows.</span>}
            align="center"
            descriptionColor="text-text-on-dark/80"
          />
          <div className="mt-10 rounded-xl border border-text-on-dark/10 bg-deep-2/50 p-6 sm:p-10">
            <BusinessGraph />
          </div>
        </Container>
      </Section>

      {/* Agent authority */}
      <Section>
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="Missions and capabilities"
            title="Agent authority"
            description="Intelligence does not imply authority. Agents receive explicit capability grants. Humans remain decision authorities where required."
            align="center"
          />
          <div className="mt-10">
            <AgentAuthority />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/agents" className="font-medium text-honey hover:underline">
              Read about agents →
            </Link>
          </div>
        </Container>
      </Section>

      {/* Evidence and replay */}
      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="Evidence · Witness · Lineage"
            title="Replayable by design"
            description="Important automation leaves enough evidence to understand what happened, why, and whether it replays cleanly."
            align="center"
          />
          <div className="mt-10">
            <ReplayEvidence />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/replay" className="font-medium text-honey hover:underline">
              Read about replay →
            </Link>
          </div>
        </Container>
      </Section>

      {/* Multi-runtime */}
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="Workers and execution"
            title="Multi-runtime convergence"
            description="Same authority model, different execution environments. Convergence captured 2026-09-16/17 with receipts on the homepage. Status labels reflect evidence, not aspirations."
            align="center"
          />
          <div className="mt-10">
            <MultiRuntime />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/integrations" className="font-medium text-honey hover:underline">
              Read about integrations →
            </Link>
          </div>
        </Container>
      </Section>

      {/* Deep dives */}
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Deep dives</span>}
            title={<span className="text-text-on-dark">Detailed specifications</span>}
            description={<span className="text-text-on-dark/80">Each topic is a technical article. Status labels are honest.</span>}
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEEP_DIVES.map((t) => (
              <Link key={t.slug} href={`/technology/${t.slug}`} className="group">
                <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-5 transition-colors group-hover:border-honey/40">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-text-on-dark group-hover:text-honey">{t.title}</h3>
                    <span className="rounded bg-honey/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-honey">
                      {t.status}
                    </span>
                  </div>
                  <span className="mt-3 inline-block text-sm font-medium text-honey">Read →</span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <CTASection />
    </>
  );
}
