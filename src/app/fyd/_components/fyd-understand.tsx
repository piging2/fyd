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
    line: "This understands my business and keeps my digital presence.",
  },
  {
    when: "Next 30 seconds",
    line: "It knows services, locations, projects, and relationships as real things, not just webpage text.",
  },
  {
    when: "Next 2 minutes",
    line: "I can explore those things, ask questions about them, see why FYD believes them, and correct them.",
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
            description="Paste a website address. FYD reads what is public and shows you what it understood: the actual things your business is made of, connected to each other."
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
            A visitor does not experience these as database records. A service
            is a thing with hours, a price range, and the people who do it. A
            project is a thing with photos, a location, and the customer it
            was for. When the business changes, the things change, and every
            place they appear stays consistent.
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
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">
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
