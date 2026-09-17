import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Continuity",
  description: "Why AI systems need to remember: continuity as the core architectural concept behind PING.",
  alternates: { canonical: "/technology/continuity" },
};

export default function ContinuityPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Continuity"
      lede="Most AI starts from zero every session. Continuity is the architectural commitment that PING does not: events are recorded, knowledge accumulates, evidence is preserved, and context survives across sessions, agents, and days."
      status="Documented"
      sections={[
        {
          heading: "The problem",
          body: (
            <>
              <p>
                A stateless chatbot is amnesiac by design. Every conversation begins with nothing:
                no memory of past decisions, no record of what was tried, no way to distinguish
                &ldquo;nothing exists&rdquo; from &ldquo;the system failed to look.&rdquo; That amnesia
                is fine for casual chat. It is disqualifying for anything that acts in the real world.
              </p>
              <p>
                Businesses run on continuity. A missed follow-up, a forgotten commitment, a decision
                whose reasoning evaporated: these are continuity failures, and they cost real money.
                An AI system that serves a business must have the same property the business needs:
                it must remember.
              </p>
            </>
          ),
        },
        {
          heading: "What continuity means in PING",
          body: (
            <>
              <p>Continuity in PING is not a single feature. It is a stack of commitments:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Events are source truth.</strong> Things that happen are recorded as events with identity, timestamp, and provenance. The event log is the system&apos;s memory of what occurred.</li>
                <li><strong>Knowledge accumulates.</strong> Events are distilled into canonical knowledge: observations, claims, relationships. New evidence updates knowledge; contradictions are preserved, not silently overwritten.</li>
                <li><strong>Evidence is attached.</strong> Every derived claim links back to the source it came from. You can always ask &ldquo;where did this come from?&rdquo; and get an answer.</li>
                <li><strong>State is replayable.</strong> Given the same causal history, the system should reach the same canonical state. Replay is how continuity is verified, not just asserted.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Continuity vs. memory",
          body: (
            <>
              <p>
                &ldquo;Memory&rdquo; in AI products usually means a longer context window or a
                vector store of past chats. That is retrieval, not continuity. Continuity adds the
                properties retrieval lacks: identity across transformations, explicit provenance,
                typed failure states (so &ldquo;not found&rdquo; never hides &ldquo;lookup
                failed&rdquo;), and deterministic replay.
              </p>
              <p>
                The test is simple: can the system explain, after the fact, what happened, why it
                happened, which version of the system decided, and show the evidence? If yes, it has
                continuity. If it can only show you a chat log, it has retrieval.
              </p>
            </>
          ),
        },
        {
          heading: "Status",
          body: (
            <p>
              Continuity is the oldest and most documented concept in PING. The event pipeline,
              canonical knowledge layer, and replay semantics are designed around it. The blog
              publishes implementation notes as the machinery matures.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Events", href: "/technology/events" },
        { label: "Evidence", href: "/technology/evidence" },
        { label: "Replay", href: "/technology/replay" },
      ]}
    />
  );
}
