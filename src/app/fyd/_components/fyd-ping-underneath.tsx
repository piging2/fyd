import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";

/**
 * /inside: PING underneath, in owner language.
 *
 * The machinery chain, translated into benefits. No architecture jargon:
 * no knowledge graphs, no event sourcing, no capability authorities.
 * FYD is the human-facing product; PING is the intelligence and
 * orchestration underneath; TenantOS keeps the boundaries.
 */

const CHAIN: { name: string; line: string; copy: FydCopyClass }[] = [
  {
    name: "The world happens",
    line: "A customer calls, a review lands, hours change, a new service launches.",
    copy: "live",
  },
  {
    name: "PING notices",
    line: "New information is observed and recorded with its source and time.",
    copy: "live",
  },
  {
    name: "PING keeps the record",
    line: "The record is kept durably. Nothing important silently disappears.",
    copy: "live",
  },
  {
    name: "FYD shows it to humans",
    line: "The understanding is projected for people: websites, answers, objects you can explore.",
    copy: "live",
  },
  {
    name: "People interact and correct",
    line: "Customers ask. Owners correct. Every correction is recorded too.",
    copy: "live",
  },
  {
    name: "Boundaries are enforced",
    line: "Every business stays separate. Private data never leaks across.",
    copy: "live",
  },
  {
    name: "Approved work gets done",
    line: "Routine work you authorized is carried out, step by step.",
    copy: "auth",
  },
  {
    name: "Results are recorded",
    line: "What happened becomes part of the record, with its outcome.",
    copy: "live",
  },
  {
    name: "The understanding improves",
    line: "Outcomes become new evidence. The system gets more useful instead of resetting.",
    copy: "coming",
  },
];

export function FydPingUnderneath() {
  return (
    <div id="inside">
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">/inside</span>}
            title={
              <span className="text-text-on-dark">
                PING underneath: the machinery that makes FYD possible
              </span>
            }
            description={
              <span className="text-text-on-dark/80">
                FYD is the human-facing product. PING is the intelligence and
                orchestration underneath it. You never need to understand PING
                internals. This is the whole story in nine steps.
              </span>
            }
            align="center"
            descriptionColor="text-text-on-dark/80"
          />
          <div className="mx-auto mt-12 max-w-2xl">
            {CHAIN.map((c, i) => (
              <ScrollReveal key={c.name}>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-honey/15 font-mono text-xs font-bold text-honey">
                      {i + 1}
                    </div>
                    {i < CHAIN.length - 1 && (
                      <div className="w-px flex-1 bg-text-on-dark/15" aria-hidden="true" />
                    )}
                  </div>
                  <div className="pb-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-bold text-text-on-dark">{c.name}</h3>
                      <FydCopyClassLabel kind={c.copy} />
                    </div>
                    <p className="mt-1 text-sm text-text-on-dark/70">{c.line}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-text-on-dark/60">
            FYD makes it human. PING makes it possible. TenantOS makes the
            boundary safe.
          </p>
        </Container>
      </Section>
    </div>
  );
}
