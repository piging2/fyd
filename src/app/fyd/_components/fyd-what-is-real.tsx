import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";

/**
 * /status: what is real. Ambition never outruns evidence.
 * Every capability claimed on this page, mapped to its copy class.
 */

const ROWS: { claim: string; copy: FydCopyClass }[] = [
  { claim: "Paste a URL, see what FYD understood", copy: "live" },
  { claim: "Two demo sites generated from their FYD understanding", copy: "live" },
  { claim: "Ask FYD answers from evidence, refuses without it", copy: "live" },
  { claim: "WHY THIS lineage on visible claims", copy: "live" },
  { claim: "Owner proposes changes in plain words, approves them", copy: "live" },
  { claim: "Corrections surviving rebuilds", copy: "coming" },
  { claim: "Presence kept current as sources change", copy: "coming" },
  { claim: "Routine work running on owner approval", copy: "auth" },
  { claim: "Opportunity spotting and proposed work", copy: "coming" },
  { claim: "Public relationships between FYD presences", copy: "coming" },
  { claim: "One identity projecting into many networks", copy: "vision" },
  { claim: "Named partners or integrations", copy: "vision" },
];

export function FydWhatIsReal() {
  return (
    <div id="status">
      <Section className="bg-surface-2" size="minor">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/status"
            title="What is real"
            description="Every capability on this page carries its copy class. Stages, not dates. Product claim never exceeds running proof."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {ROWS.map((r) => (
              <ScrollReveal key={r.claim}>
                <div className="flex h-full items-start justify-between gap-4 rounded-lg border border-border-soft bg-surface p-5">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-text">{r.claim}</p>
                  <FydCopyClassLabel kind={r.copy} className="shrink-0" />
                </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-text-subtle">
            "Named partners or integrations" sits at long-term vision because
            FYD names no partners until there is evidence and authorization.
          </p>
        </Container>
      </Section>
    </div>
  );
}
