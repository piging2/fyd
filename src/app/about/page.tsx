import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "About",
  description: "About PING: continuity infrastructure for AI agents, and PING Social, the consultancy that puts it to work for real businesses.",
  alternates: { canonical: "/about" },
};

const principles = [
  {
    title: "Be useful",
    text: "Technology should reduce uncertainty and busywork, not add ceremony. If it does not make a business run better, it does not ship.",
  },
  {
    title: "Prove it",
    text: "Claims need evidence. Systems need replay. A result you cannot explain or reproduce is not a result you can trust.",
  },
  {
    title: "Humans stay in control",
    text: "Automation handles the repetitive work so owners and skilled workers can focus on customers, jobs, and judgment calls.",
  },
  {
    title: "One authority per concern",
    text: "Every important capability has exactly one owner. Duplication is how systems rot; boundaries are how they last.",
  },
];

export default function AboutPage() {
  const tenant = getTenant();
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">About</span>}
            title={<span className="text-text-on-dark">PING is infrastructure for systems that remember</span>}
            description={<span className="text-text-on-dark/90">{tenant.description}</span>}
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Two halves, one system</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <article className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="text-lg font-bold text-text">PING, the system</h3>
              <p className="mt-2 text-text-muted">
                An evolving intelligence system: events become canonical knowledge, knowledge becomes
                action, action becomes evidence. Continuity, agent infrastructure, evidence and
                provenance, deterministic replay. Built in the open, documented on this site.
              </p>
              <Link href="/technology" className="mt-4 inline-block font-medium text-honey hover:underline">
                Read the architecture →
              </Link>
            </article>
            <article className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="text-lg font-bold text-text">{tenant.operator.business}, the consultancy</h3>
              <p className="mt-2 text-text-muted">
                The operating business. {tenant.operator.name} works with home service businesses to
                put AI to practical use: capture more opportunities, reduce administrative drag,
                respond faster, operate more consistently. Consultative, not one-size-fits-all.
              </p>
              <Link href="/contact" className="mt-4 inline-block font-medium text-honey hover:underline">
                Work with us →
              </Link>
            </article>
          </div>
        </Container>
      </Section>

      <Section className="bg-surface-2">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Operating principles</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {principles.map((p) => (
              <article key={p.title} className="rounded-lg border border-border-soft bg-surface p-6">
                <h3 className="text-lg font-bold text-text">{p.title}</h3>
                <p className="mt-2 text-text-muted">{p.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">Provenance</h2>
          <p className="mt-4 text-text-muted">
            {tenant.provenance.note} This site is the first tenant on the TenantOS platform model:
            platform code plus tenant configuration plus content. A second tenant would add its own
            configuration, not fork this codebase.
          </p>
          <p className="mt-4 text-text-muted">
            Operated by {tenant.operator.name}, {tenant.operator.role} of {tenant.operator.business}.
          </p>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
