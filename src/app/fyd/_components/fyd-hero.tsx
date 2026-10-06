import { Container, Section } from "@/components/section";
import { BlueprintGrid } from "@/components/blueprint-grid";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * FYD hero: the 60-second comprehension test starts here.
 * Ordinary language only. No architecture jargon.
 */
export function FydHero() {
  return (
    <Section className="relative overflow-hidden bg-deep" size="major">
      <BlueprintGrid />
      <Container className="relative">
        <ScrollReveal>
          <p className="mb-6 font-mono text-xs font-bold uppercase tracking-widest text-honey">
            /fyd
          </p>
          <h1
            className="max-w-3xl text-4xl font-bold text-text-on-dark sm:text-5xl lg:text-6xl"
            style={{
              lineHeight: "var(--leading-display)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            Give FYD your business.
            <br />
            It keeps your whole digital presence.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg text-text-on-dark/90"
            style={{ lineHeight: "var(--leading-body)" }}
          >
            FYD learns your business as connected things: services, locations,
            projects, people, offers. It builds your website and answers your
            customers from that understanding. You can see what it knows, ask
            why it believes it, and correct it in plain words. You stay in
            control.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#try"
              className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
            >
              Try it: paste your URL
            </a>
            <a
              href="#explore"
              className="inline-flex h-12 items-center justify-center rounded-full border border-text-on-dark/30 px-8 font-semibold text-text-on-dark transition-colors hover:bg-text-on-dark/10"
            >
              Explore the product
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <FydCopyClassLabel kind="live" />
            <p className="text-sm text-text-on-dark/60">
              Running proof on this server: two demo businesses, built from
              their FYD understanding.
            </p>
          </div>
          <div className="mt-6 rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-5">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">
              The 10-second version
            </p>
            <p className="mt-2 text-sm text-text-on-dark/80">
              This understands my business and keeps my digital presence. Not a
              website builder: the site is built from the understanding, and
              the understanding answers my customers.
            </p>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
