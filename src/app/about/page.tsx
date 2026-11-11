import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import PigiGif from "@/components/pigi-gif";
import { getTenant } from "@/lib/tenant-config";
import { buildAboutPageJsonLd } from "@/lib/structured-data";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About PING and PingFyd",
  description: "PingFyd helps Western Colorado businesses get found, followed up with, and remembered. PING is the system underneath it all. From Grand Junction, Colorado.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    title: "About PING and PingFyd · PING",
    description: "PingFyd helps Western Colorado businesses get found, followed up with, and remembered. PING is the system underneath it all. From Grand Junction, Colorado.",
    url: siteUrl + "/about",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "About PING and PingFyd · PING",
    description: "PingFyd helps Western Colorado businesses get found, followed up with, and remembered. PING is the system underneath it all. From Grand Junction, Colorado.",
  },
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
  const aboutPageJsonLd = buildAboutPageJsonLd({
    name: "About PING and PingFyd",
    url: siteUrl + "/about",
    description: typeof metadata.description === "string" ? metadata.description : undefined,
  });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd) }}
      />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            headingLevel="h1"
            eyebrow={<span className="text-honey">About</span>}
            title={<span className="text-text-on-dark">A system that remembers, built for businesses that cannot afford to forget</span>}
            description={<span className="text-text-on-dark/90">{tenant.description}</span>}
          />
        </Container>
      </Section>

      <Section size="minor">
        <Container className="max-w-4xl">
          <figure className="mx-auto max-w-xl">
            <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface">
              <PigiGif
                gif="/brand/pigi-call-center-variant1.gif"
                poster="/brand/pigi-call-center-variant1-poster.webp"
                width={553}
                height={309}
                alt="Pigi, a golden mascot in a purple suit, juggling two phones and a tablet at a call center desk while the crew works around him, five star reviews and a route map on the wall behind"
              />
            </div>
            <figcaption className="mt-2 text-center text-sm text-text-muted">
              The front desk, PingFyd style: nothing rings unanswered for long.
            </figcaption>
          </figure>
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
              <Link href="/technology" className="mt-4 inline-block font-medium text-honey-text hover:underline">
                Read the architecture →
              </Link>
            </article>
            <article className="rounded-lg border border-border-soft bg-surface p-6">
              <h3 className="text-lg font-bold text-text">{tenant.operator.business}, the consultancy</h3>
              <p className="mt-2 text-text-muted">
                The operating business. {tenant.operator.name} works with home service businesses to
                put AI to practical use: capture more opportunities, reduce administrative drag,
                respond faster, operate more consistently. Consultative, not one-size-fits-all.
                PingFyd is based in Grand Junction, Colorado, and works with businesses
                across Western Colorado.
              </p>
              <Link href="/contact" className="mt-4 inline-block font-medium text-honey-text hover:underline">
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
