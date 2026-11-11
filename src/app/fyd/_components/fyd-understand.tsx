import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * /understand: FYD learns the business as connected things.
 * The 30-second and 2-minute layers of the comprehension test.
 */

const OBJECT_KINDS = [
  "Business",
  "Service",
  "Location",
  "Project",
  "Offer",
  "Person",
  "Question",
  "Evidence",
  "Relationship",
  "Action",
];

const COMPREHENSION = [
  {
    when: "First 10 seconds",
    line: "This understands my business and keeps my presence current.",
  },
  {
    when: "Next 30 seconds",
    line: "It knows my services, locations, projects, and people as the real things they are, not just words on a webpage.",
  },
  {
    when: "Next 2 minutes",
    line: "I can look at what it knows, ask questions about it, see why it believes it, and correct it in plain words.",
  },
];

export function FydUnderstand() {
  return (
    <div id="understand">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/understand"
            title="FYD understands your business, not your pages"
            description="Paste your website address. FYD reads what is public and shows you your business the way a customer sees it: your services, your projects, your people, and your offers, all in one place."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            {OBJECT_KINDS.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border-soft bg-surface px-4 py-1.5 text-sm font-semibold text-text"
              >
                {k}
              </span>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-lg text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
            Your customers do not think in pages. They think in services with
            hours and prices, projects with photos and locations, and the
            people who do the work. FYD keeps your business in that shape.
            When something changes, it changes once, and every place your
            customers look stays consistent.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <FydCopyClassLabel kind="live" />
            <p className="text-sm text-text-muted">
              Paste-a-URL preview is live below, in the Try it section. No
              account. Only public information is read.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {COMPREHENSION.map((c) => (
              <ScrollReveal key={c.when}>
                <div className="h-full rounded-lg border border-border-soft bg-surface p-6">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey-text">
                    {c.when}
                  </p>
                  <p className="mt-3 text-base font-medium text-text">{c.line}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="mt-8 text-sm text-text-subtle">
            This page is built to pass that comprehension test. If it does not,
            the page failed, not the reader.
          </p>
        </Container>
      </Section>
    </div>
  );
}
