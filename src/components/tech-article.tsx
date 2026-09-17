import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";

export interface TechSection {
  heading: string;
  body: React.ReactNode;
}

interface TechArticleProps {
  eyebrow: string;
  title: string;
  lede: string;
  status: "Documented" | "In development" | "Direction";
  sections: TechSection[];
  related: Array<{ label: string; href: string }>;
}

const statusStyle: Record<TechArticleProps["status"], string> = {
  "Documented": "bg-honey/10 text-honey",
  "In development": "bg-ping-violet/10 text-ping-violet",
  "Direction": "bg-surface-muted text-text-muted",
};

export function TechArticle({ eyebrow, title, lede, status, sections, related }: TechArticleProps) {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-honey">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold text-text-on-dark" style={{ lineHeight: 'var(--leading-display)' }}>{title}</h1>
          <p className="mt-4 text-lg text-text-on-dark/90" style={{ lineHeight: 'var(--leading-body)' }}>{lede}</p>
          <span className={`mt-6 inline-block rounded px-3 py-1 text-xs font-semibold ${statusStyle[status]}`}>
            {status}
          </span>
        </Container>
      </Section>
      <Section>
        <Container className="max-w-3xl">
          <div className="space-y-10">
            {sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-2xl font-bold text-text">{s.heading}</h2>
                <div className="mt-3 space-y-4 text-text-muted" style={{ lineHeight: 'var(--leading-body)' }}>
                  {s.body}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-12 border-t border-border-soft pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">Related</h3>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="font-medium text-honey hover:underline">{r.label} →</Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
