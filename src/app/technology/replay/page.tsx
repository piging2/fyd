import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Replay",
  description: "Deterministic replay: what happened, why, which version decided, and whether the replay matches.",
  alternates: { canonical: "/technology/replay" },
};

export default function ReplayPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Replay"
      lede="A system that cannot explain its important decisions becomes increasingly difficult to trust. Replay is PING's answer: the ability to reconstruct what happened, why it happened, and prove that the reconstruction matches the original."
      status="In development"
      sections={[
        {
          heading: "What replay must answer",
          body: (
            <>
              <p>For important behavior, PING aims to answer, after the fact:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>What happened?</li>
                <li>Why did it happen, and what information caused it?</li>
                <li>Which authority made the decision?</li>
                <li>Which version of the system executed it?</li>
                <li>Can we reproduce the result, and prove the replay is equivalent?</li>
              </ul>
              <p>
                Replay is therefore not debugging infrastructure. It is institutional memory: the
                difference between a system that learns and a system that merely runs.
              </p>
            </>
          ),
        },
        {
          heading: "Determinism as a product feature",
          body: (
            <>
              <p>
                Where PING claims deterministic behavior, determinism is a guarantee, not an
                implementation detail. Same causal history should produce the same replay ordering,
                the same execution, the same canonical state, the same canonical bytes, the same
                hash. Constitutional outputs must not depend accidentally on machine, OS, locale,
                database ordering, timestamps, or random IDs.
              </p>
              <p>
                Where nondeterminism is intentional (sampling, timing, external data), it is made
                explicit and kept outside deterministic constitutional outputs. Accidental
                nondeterminism is a bug; declared nondeterminism is a design choice.
              </p>
            </>
          ),
        },
        {
          heading: "The witness concept",
          body: (
            <p>
              A witness is a compact, checkable attestation that a particular execution produced a
              particular canonical result. Witnesses let two parties agree on what happened without
              re-running the world: compare the witness, compare the hash, and you know whether you
              are looking at the same history. This is the direction; the full witness protocol is
              still being designed.
            </p>
          ),
        },
        {
          heading: "Status",
          body: (
            <p>
              Replay semantics are designed and partially implemented: event ordering, canonical
              state derivation, and hash-chained attestation exist in prototype form. The
              end-to-end &ldquo;replay this decision and prove equivalence&rdquo; loop is in
              development. Until it is complete, this page documents the design, not a finished
              capability.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Events", href: "/technology/events" },
        { label: "Evidence", href: "/technology/evidence" },
        { label: "Continuity", href: "/technology/continuity" },
      ]}
    />
  );
}
