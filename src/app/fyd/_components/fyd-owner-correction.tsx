import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * /correct: owner correction. Say it in plain words, approve the exact
 * change, and the correction survives rebuilds.
 *
 * Proven on the Coppersmith Plumbing demo: the owner typed
 * "Move emergency plumbing first." That conversational correction path
 * is live in demo-owner mode. Honest about the authorization gate.
 */

const STEPS = [
  {
    n: "01",
    title: "You say it in plain words",
    detail:
      'On the Coppersmith demo, the owner typed: "Move emergency plumbing first." No settings panel, no ticket, no code.',
  },
  {
    n: "02",
    title: "FYD shows the exact change it proposes",
    detail:
      "Before anything changes, you see precisely what will move, what it affects, and what stays the same.",
  },
  {
    n: "03",
    title: "You approve",
    detail:
      "Nothing changes without your approval. Not the wording, not the order, not the site. Approval is the gate.",
  },
  {
    n: "04",
    title: "Your correction survives rebuilds",
    detail:
      "The next time the presence is regenerated, your correction is still there. You correct FYD once, not every time.",
  },
];

export function FydOwnerCorrection() {
  return (
    <div id="correct">
      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/correct"
            title="Correct FYD in plain words"
            description="FYD will get things wrong. That is expected. What matters is what happens next: you say it plainly, you approve the fix, and it stays fixed."
            align="center"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {STEPS.map((s) => (
              <ScrollReveal key={s.n}>
                <div className="h-full rounded-lg border border-border-soft bg-surface p-6">
                  <p className="font-mono text-xs font-bold text-honey">{s.n}</p>
                  <h3 className="mt-2 text-lg font-bold text-text">{s.title}</h3>
                  <p className="mt-2 text-text-muted">{s.detail}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-border-soft bg-surface p-6">
            <p className="text-sm text-text-muted">
              Conversational correction is live on the demo tenants in
              demo-owner mode, demonstrated on the Coppersmith demo 2026-09-24.
              Owner authorization is required before any change lands.
            </p>
            <div className="mt-4">
              <Link
                href="/build-my-fyd"
                className="font-semibold text-honey hover:underline"
              >
                Try the fresh-URL intake →
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </div>
  );
}
