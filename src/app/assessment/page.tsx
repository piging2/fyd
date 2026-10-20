import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";
import { AssessmentForm } from "./assessment-form";

const tenant = getTenant();
const siteUrl =
  tenant.domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://ping.vercel.app");

const TITLE = "Practical technology and operations assessment";
const DESCRIPTION =
  "A practical technology and operations assessment from PING: find what wastes time or money, fix what does not need AI, and automate only what genuinely helps.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/assessment" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl + "/assessment",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "What is wasting time or money today",
    body: "The assessment starts with how the business actually runs: where time goes, where follow-up slips, where the same information gets typed twice, and where work waits on a person who is busy doing the real job.",
  },
  {
    title: "The root cause",
    body: "Symptoms are easy to list. The assessment digs to the cause underneath them, because fixing a symptom while the cause stays just moves the problem.",
  },
  {
    title: "What could be simplified without AI",
    body: "Some of what is slow is a process problem, not a technology problem. If a simpler process, a clearer handoff, or one less tool fixes it, the assessment says so. Not everything needs automation, and nothing needs AI for its own sake.",
  },
  {
    title: "What automation or AI could genuinely improve",
    body: "Where automation or AI would genuinely help, the assessment names it plainly: the task, what would change, and why it is worth doing. Where it would not help, it says that too.",
  },
  {
    title: "What implementation would cost",
    body: "There is no price on this page because honest pricing follows the findings, not the other way around. Once the assessment shows what is worth doing, implementation cost is scoped from that work: what would be built, in what order, and what each step involves. You see the scope before anyone talks about figures.",
  },
  {
    title: "The measurable result to expect",
    body: "A baseline is established first: how things run today, measured before anything changes. Results are then measured against that baseline. No savings are promised before a baseline exists.",
  },
  {
    title: "What stays under human control",
    body: "The owner and the team. Automation supports the people doing the work; it does not replace their judgment. Decisions that matter stay with the humans who are accountable for them.",
  },
];

export default function AssessmentPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">
            /assessment
          </p>
          <h1
            className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl"
            style={{
              lineHeight: "var(--leading-display)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            A practical technology and operations assessment.
          </h1>
          <p
            className="mt-6 max-w-2xl text-lg text-text-on-dark/90"
            style={{ lineHeight: "var(--leading-body)" }}
          >
            A scoped introductory assessment of how your business uses
            technology and where its operations slow down. PING studies how
            things really work, finds what is wasting time or money, and tells
            you honestly what would improve it, including what needs no AI at
            all.
          </p>
        </Container>
      </Section>

      <Section size="minor">
        <Container className="max-w-4xl">
          <h2 className="text-2xl font-bold text-text">What the assessment covers</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {SECTIONS.map((s) => (
              <article
                key={s.title}
                className="rounded-lg border border-border-soft bg-surface p-6"
              >
                <h3 className="text-lg font-bold text-text">{s.title}</h3>
                <p className="mt-2 text-text-muted" style={{ lineHeight: "var(--leading-body)" }}>
                  {s.body}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <Section size="minor" className="bg-surface-2">
        <Container className="max-w-3xl">
          <h2 className="text-2xl font-bold text-text">Request the assessment</h2>
          <p className="mt-2 text-text-muted">
            Tell us about the business and what feels slow, wasteful, or stuck.
            PING reviews every request and follows up using the contact
            preference you give.
          </p>
          <div className="mt-8">
            <AssessmentForm />
          </div>
        </Container>
      </Section>
    </>
  );
}
