import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { WhyThis } from "@/fyd/ui/why-this";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * /why: the WHY THIS interaction. One tap drills from a visible claim
 * back through the record to the source it came from.
 *
 * Reuses the shared WhyThis component read-only. The lineage below is
 * illustrative; on a live demo site the lineage is computed from the
 * actual evidence record. That distinction is stated, not hidden.
 */
export function FydWhy() {
  return (
    <div id="why">
      <Section size="minor">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="/why"
            title="Why this? Every claim shows its work."
            description="See a claim about a business on FYD and you can ask why it says that. One tap walks you back to where it came from, step by step, down to the actual source. Nothing about your business is ever just asserted."
            align="center"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>
          <ScrollReveal>
            <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border-soft bg-surface p-6 sm:p-8">
              <p className="text-lg font-semibold text-text">
                Coppersmith Plumbing offers emergency plumbing.
              </p>
              <div className="mt-4">
                <WhyThis
                  claim="Coppersmith Plumbing offers emergency plumbing."
                  steps={[
                    { step: "What you see", detail: "Emergency plumbing, listed under services" },
                    { step: "The field it came from", detail: "service.offered" },
                    { step: "Claim", detail: "read from the business's public website" },
                    { step: "Evidence", detail: "page text, fetched and recorded 2026-09-24" },
                    { step: "Source", detail: "the business's public website" },
                  ]}
                />
              </div>
              <p className="mt-4 text-xs text-text-subtle">
                Illustrative lineage. On a live demo site, this lineage is
                computed from the actual evidence record behind the claim.
              </p>
            </div>
          </ScrollReveal>
        </Container>
      </Section>
    </div>
  );
}
