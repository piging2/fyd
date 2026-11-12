import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";

/**
 * /how: the FYD loop in owner language.
 * OBSERVE -> UNDERSTAND -> BUILD -> KEEP CURRENT -> HELP ->
 * ACT WITH PERMISSION -> LEARN.
 */

const STEPS: {
  n: string;
  name: string;
  line: string;
  detail: string;
  copy: FydCopyClass;
}[] = [
  {
    n: "1",
    name: "Observe",
    line: "FYD reads your public sources.",
    detail:
      "Your website, listings, and anything else public about the business. Only public information is ever read at this step.",
    copy: "live",
  },
  {
    n: "2",
    name: "Understand",
    line: "Builds a picture of your business, as the real things it is made of.",
    detail:
      "Your services, locations, people, offers, and projects, and how they connect. The actual business, not just the words on your pages.",
    copy: "live",
  },
  {
    n: "3",
    name: "Build",
    line: "Builds your website and your answers from that picture.",
    detail:
      "Your website and the answers your customers get come from the same understanding, so they never contradict each other.",
    copy: "live",
  },
  {
    n: "4",
    name: "Keep current",
    line: "Re-reads your sources and folds in what changed. Your corrections stick.",
    detail:
      "When the business changes, the understanding updates and every place it appears follows. Owner corrections persist across rebuilds.",
    copy: "coming",
  },
  {
    n: "5",
    name: "Help",
    line: "Ask FYD answers your customers, and shows its sources.",
    detail:
      "Answers cite their sources. When the evidence is missing, FYD says it does not know instead of guessing.",
    copy: "live",
  },
  {
    n: "6",
    name: "Act with permission",
    line: "Routine work happens only when you approve it.",
    detail:
      "FYD can propose work, but nothing acts on its own. Each step waits for your explicit approval.",
    copy: "auth",
  },
  {
    n: "7",
    name: "Learn",
    line: "What happens becomes the next lesson.",
    detail:
      "What worked, and what did not, feeds back in, so FYD gets more useful over time instead of starting over.",
    copy: "coming",
  },
];

export function FydHowItWorks() {
  return (
    <div id="how">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/how"
            title="How it works: the loop"
            description="Your public information goes in once and keeps getting more useful: FYD reads it, builds from it, keeps it current, and learns from what happens. Each round starts smarter than the last."
            align="center"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <ScrollReveal key={s.n}>
                <div className="flex h-full flex-col rounded-lg border border-border-soft bg-surface p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-bold text-honey-text">{s.n}</span>
                    <FydCopyClassLabel kind={s.copy} />
                  </div>
                  <h3 className="mt-3 text-base font-bold uppercase tracking-wide text-text">
                    {s.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-text">{s.line}</p>
                  <p className="mt-3 flex-1 text-sm text-text-muted">{s.detail}</p>
                </div>
              </ScrollReveal>
            ))}
            <ScrollReveal>
              <div className="flex h-full flex-col justify-center rounded-lg border border-dashed border-honey/40 bg-honey/5 p-6">
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey-text">
                  Learn → Observe
                </p>
                <h3 className="mt-2 text-lg font-bold uppercase tracking-wide text-text">
                  The loop closes
                </h3>
                <p className="mt-1 text-sm font-semibold text-text">
                  New evidence feeds the next cycle.
                </p>
                <p className="mt-3 text-sm text-text-muted">
                  Observe, understand, build, keep current, help, act with
                  permission, learn. Then observe again, with a better
                  understanding than before.
                </p>
                <div className="mt-4">
                  <FydCopyClassLabel kind="coming" />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    </div>
  );
}
