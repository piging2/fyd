import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * Live demo sites: the two authorized FYD demo tenants running on this
 * server. Referenced as running proof, not customer sites.
 */

const SITES = [
  {
    href: "/sites/happy-place",
    name: "Happy Place",
    proves: "A complete business presence generated from its FYD understanding.",
    ask: "Ask about its services, hours, and offers.",
  },
  {
    href: "/sites/coppersmith-plumbing",
    name: "Coppersmith Plumbing",
    proves: "A trades business presence, including conversational customization proven on this demo.",
    ask: "Ask about emergency plumbing and services.",
  },
];

export function FydDemoSites() {
  return (
    <div id="see">
      <Section size="minor">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/see · running proof"
            title="Two live demos, running on this server"
            description="Complete FYD presences generated from their business understanding. Open one, explore its objects, ask it questions, check the why behind its answers."
          />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <FydCopyClassLabel kind="live" />
            <p className="text-sm text-text-muted">
              Demo businesses for the product test. Not customer sites.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {SITES.map((s) => (
              <ScrollReveal key={s.href}>
                <div className="flex h-full flex-col rounded-2xl border border-border-soft bg-surface p-8">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">
                    Demo tenant
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-text">{s.name}</h3>
                  <p className="mt-3 flex-1 text-text-muted">{s.proves}</p>
                  <p className="mt-2 text-sm text-text-subtle">{s.ask}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={s.href}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-honey px-6 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
                    >
                      Open the demo
                    </Link>
                    <a
                      href="#fyd-ask"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 font-semibold text-text transition-colors hover:bg-surface-2"
                    >
                      Ask about it below
                    </a>
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
