import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Events",
  description: "The event plane: how things that happen become canonical, queryable, and replayable records.",
  alternates: { canonical: "/technology/events" },
};

export default function EventsPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Events"
      lede="Everything PING knows starts as an event: something happened, and the system wrote it down. The event plane is the recorder. Canonical knowledge, projections, and replay all derive from it, and none of them are allowed to silently become the source."
      status="In development"
      sections={[
        {
          heading: "Source truth vs. derived truth",
          body: (
            <>
              <p>
                PING distinguishes layers of truth and refuses to let them silently merge. Source
                truth is what happened: an event, an observation, an imported artifact. Derived
                truth is what the system calculated: embeddings, projections, summaries,
                classifications. Presented truth is what PING chooses to show. Evidence is what
                lets someone else verify the claim.
              </p>
              <p>
                A projection is not the source event. A summary is not the underlying evidence. A
                hash is not the object it identifies. Every transformation must preserve identity,
                or the system is manufacturing certainty.
              </p>
            </>
          ),
        },
        {
          heading: "The event lifecycle",
          body: (
            <>
              <p>An event moves through a typed pipeline:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Capture:</strong> the raw occurrence is recorded with identity, timestamp, source, and provenance.</li>
                <li><strong>Canonicalization:</strong> the event is normalized into canonical form so identical causes produce identical records.</li>
                <li><strong>Distillation:</strong> observations are extracted with source spans and confidence; contradictions are preserved.</li>
                <li><strong>Emission:</strong> verified, high-quality intelligence is emitted to the canonical knowledge layer.</li>
              </ul>
              <p>
                Each stage has typed states, including failure states. A stage that fails must say
                so explicitly; it must never emit an empty success.
              </p>
            </>
          ),
        },
        {
          heading: "Failure is information",
          body: (
            <p>
              PING never confuses &ldquo;nothing exists&rdquo; with &ldquo;the system failed to find
              it.&rdquo; Service failures, configuration failures, and schema failures each have
              deterministic semantics: what failed, which boundary failed, whether retry is safe,
              whether state changed, and whether the result can be trusted. An empty answer is never
              a hiding place for an infrastructure failure.
            </p>
          ),
        },
        {
          heading: "Status",
          body: (
            <p>
              The event pipeline is in active development. The capture, canonicalization, and
              distillation stages exist with typed state tracking; emission policies (what qualifies
              as canonical knowledge vs. operational data) are being refined. This page will be
              updated as stages stabilize.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Continuity", href: "/technology/continuity" },
        { label: "Evidence", href: "/technology/evidence" },
        { label: "Replay", href: "/technology/replay" },
      ]}
    />
  );
}
