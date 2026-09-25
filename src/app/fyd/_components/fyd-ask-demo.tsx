"use client";

/**
 * /ask: Ask FYD, evidence-bounded, live.
 *
 * Reuses the shared AskObjectPanel read-only against the Coppersmith
 * Plumbing demo tenant. Answers come from that tenant's recorded evidence;
 * when the pipeline has no supporting evidence it refuses honestly.
 * Fail closed: transport or server failure never invents an answer.
 *
 * Object sheet "Ask FYD" actions route here via the fyd-ask-question
 * window event, so Ask understands the current object context.
 */

import * as React from "react";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AskObjectPanel } from "@/fyd/ui/ask-object-panel";
import { FydCopyClassLabel } from "./fyd-copy-class";

const SAMPLE_QUESTIONS = [
  "What services does Coppersmith Plumbing offer?",
  "Does Coppersmith Plumbing handle emergency calls?",
  "Tell me about Coppersmith Plumbing.",
];

export function FydAskDemo() {
  const [initialQuestion, setInitialQuestion] = React.useState<string | undefined>(undefined);
  const [askKey, setAskKey] = React.useState(0);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === "string" && q.trim().length > 0) {
        setInitialQuestion(q);
        setAskKey((k) => k + 1);
      }
    };
    window.addEventListener("fyd-ask-question", handler);
    return () => window.removeEventListener("fyd-ask-question", handler);
  }, []);

  return (
    <div id="fyd-ask">
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">/ask</span>}
            title={<span className="text-text-on-dark">Ask FYD. It answers from evidence, or says it does not know.</span>}
            description={
              <span className="text-text-on-dark/80">
                Ask about the Coppersmith Plumbing demo below. Every answer
                comes from that business's recorded evidence. No evidence, no
                answer: FYD says so honestly instead of guessing.
              </span>
            }
            align="center"
            descriptionColor="text-text-on-dark/80"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>
          <ScrollReveal>
            <div className="mt-10 rounded-2xl border border-text-on-dark/10 bg-deep-2/60 p-6 sm:p-8">
              <AskObjectPanel
                key={askKey}
                siteId="coppersmith-plumbing"
                objectName="Coppersmith Plumbing"
                sampleQuestions={SAMPLE_QUESTIONS}
                initialQuestion={initialQuestion}
              />
              <p className="mt-4 text-xs text-text-on-dark/50">
                Visitor mode: public objects only. Try a question with no
                answer in the record, like the owner's favorite color, and
                watch the honest refusal. That refusal is the feature.
              </p>
            </div>
          </ScrollReveal>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 text-sm sm:grid-cols-3">
            {[
              ["Answers cite sources", "Every answer carries the evidence it came from."],
              ["No evidence, no answer", "Missing evidence produces an honest refusal, never a guess."],
              ["Fail closed", "If the service cannot answer, it says so. It never invents."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-4">
                <p className="font-bold text-text-on-dark">{t}</p>
                <p className="mt-1 text-text-on-dark/70">{d}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  );
}
