import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";

export const metadata: Metadata = {
  title: "Newsletter Archive",
  description: "Archive of the PING newsletter: continuity, agents, and practical business automation.",
  alternates: { canonical: "/newsletter" },
};

// Placeholder newsletter data - will be replaced with actual content system
const newsletters = [
  {
    id: 1,
    title: "What continuity means for AI agents",
    date: "2024-03-15",
    excerpt: "Why systems that act need to remember: events, knowledge, evidence, and replay.",
  },
  {
    id: 2,
    title: "Building the first TenantOS tenant",
    date: "2024-02-20",
    excerpt: "How this site became the proof of concept for the TenantOS platform model.",
  },
  {
    id: 3,
    title: "Evidence before eloquence",
    date: "2024-01-10",
    excerpt: "Every claim checkable: verification grades, contradiction preservation, and typed failures.",
  },
];

export default function NewsletterArchivePage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Newsletter</span>}
            title={<span className="text-text-on-dark">Notes on Continuity and Agents</span>}
            description={<span className="text-text-on-dark/90">Architecture notes, implementation lessons, and practical automation thinking. One email when there is something worth saying.</span>}
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <div className="space-y-6">
            {newsletters.map((newsletter) => (
              <article
                key={newsletter.id}
                className="rounded-lg border border-border-soft bg-surface p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 text-sm text-muted-foreground">
                  {new Date(newsletter.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <h3 className="mb-2 text-xl font-bold text-text">{newsletter.title}</h3>
                <p className="text-text-muted">{newsletter.excerpt}</p>
                <div className="mt-4">
                  <button className="text-honey hover:underline font-medium">
                    Read full newsletter →
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 rounded-lg bg-surface-muted p-8 text-center">
            <h3 className="text-xl font-bold text-text mb-2">Don't miss future newsletters</h3>
            <p className="text-text-muted mb-4">
              Subscribe to receive homeowner tips, maintenance reminders, and project inspiration directly in your inbox.
            </p>
            <a
              href="/#newsletter"
              className="inline-flex items-center justify-center rounded-lg bg-honey px-6 py-3 font-semibold text-deep transition-colors hover:bg-honey/90"
            >
              Subscribe to Newsletter
            </a>
          </div>
        </Container>
      </Section>
    </>
  );
}
