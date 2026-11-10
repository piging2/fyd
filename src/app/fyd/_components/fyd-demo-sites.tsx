import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * Running proof sites: the two authorized FYD demo tenants plus PING's
 * own business, all running on this server. The demos are referenced
 * as running proof, not customer sites. PingFyd is the operator's
 * own business running on the same system: not a demo, not a customer
 * testimonial.
 */

const SITES = [
  {
    href: "/sites/happy-place",
    kind: "Demo tenant",
    cta: "Explore Happy Place",
    name: "Happy Place",
    proves: "Browse carpentry services and a before-and-after project view.",
  },
  {
    href: "/sites/coppersmith-plumbing",
    kind: "Demo tenant",
    cta: "Explore Coppersmith Plumbing",
    name: "Coppersmith Plumbing",
    proves: "Explore plumbing and HVAC services, and open the source information behind a service.",
  },
  {
    href: "/sites/ping-fyd",
    kind: "Operator's own business",
    cta: "Open PingFyd",
    name: "PingFyd",
    proves: "Explore the operator’s AI call answering, lead follow-up and scheduling services.",
  },
];

export function FydDemoSites() {
  return (
    <div id="see">
      <Section size="minor">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/see · running proof"
            title="Two live demos and PING itself, running on this server"
            description="Complete FYD presences generated from their business understanding. Open one, explore its objects, ask it questions, check the why behind its answers."
          />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <FydCopyClassLabel kind="live" />
            <p className="text-sm text-text-muted">
              The two demo businesses are for the product test and are not
              customer sites. PingFyd is the operator&apos;s own business,
              running on the same system.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SITES.map((s) => (
              <ScrollReveal key={s.href}>
                <div className="flex h-full flex-col rounded-2xl border border-border-soft bg-surface p-8">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey-text">
                    {s.kind}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-text">{s.name}</h3>
                  <p className="mt-3 flex-1 text-text-muted">{s.proves}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={s.href}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-honey px-6 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
                    >
                      {s.cta}
                    </Link>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  );
}
