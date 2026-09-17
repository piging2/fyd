import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Evidence",
  description: "Evidence and provenance for autonomous systems: every claim traces to its source.",
  alternates: { canonical: "/technology/evidence" },
};

export default function EvidencePage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Evidence"
      lede="An autonomous system will eventually tell you something that matters. Evidence is the discipline that makes the telling trustworthy: every claim traces to its source, every source carries verification status, and uncertainty is explicit rather than laundered into confidence."
      status="Documented"
      sections={[
        {
          heading: "Evidence before eloquence",
          body: (
            <>
              <p>
                PING prefers a correct, well-supported answer over an impressive one. When the system
                makes an important claim, it shows where the claim came from. When it modifies
                architecture, it shows what changed. When it declares success, it shows what was
                verified. The more consequential the claim, the stronger the evidence required.
              </p>
              <p>
                This is a product decision, not just an engineering virtue. Trust in an autonomous
                system is not a personality trait; it is a property of behavior. Systems that show
                their work get trusted with more. Systems that assert get audited.
              </p>
            </>
          ),
        },
        {
          heading: "The evidence contract",
          body: (
            <>
              <p>Every observation PING records carries:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>The statement itself,</strong> in plain language.</li>
                <li><strong>A source span,</strong> pointing at the exact material the statement was drawn from.</li>
                <li><strong>A confidence grade,</strong> from confirmed to unknown. Never assumed, never hallucinated.</li>
                <li><strong>Verification status,</strong> recording whether the claim was independently checked and what the check found.</li>
                <li><strong>Contradictions preserved,</strong> because two sources disagreeing is information, not an error to be averaged away.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Grading, not guessing",
          body: (
            <p>
              When PING researches something (a business&apos;s technology stack, a market signal, a
              technical claim), every finding is graded: confirmed, strong indication, weak
              indication, or unknown. The grade is part of the record. Downgrading a weak signal to
              unknown is a success of the system, not a failure: it means the verification gate did
              its job. Fail-closed beats confident-and-wrong every time.
            </p>
          ),
        },
        {
          heading: "Provenance across transformations",
          body: (
            <p>
              Data crosses boundaries constantly: raw artifact to observation, observation to claim,
              claim to projection. At each crossing, PING asks what identity, ordering, provenance,
              and semantics must survive. Silent normalization that destroys meaningful distinctions
              is treated as a bug, not an optimization. The lineage from presented answer back to
              source event must remain walkable.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Events", href: "/technology/events" },
        { label: "Replay", href: "/technology/replay" },
        { label: "Agents", href: "/technology/agents" },
      ]}
    />
  );
}
