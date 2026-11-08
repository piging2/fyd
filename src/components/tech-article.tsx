import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { Reveal } from "@/components/reveal";
import { getTenant } from "@/lib/tenant-config";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
import { getAllPosts } from "@/lib/blog";
import { getEssaySlugsForTechPage } from "@/lib/essay-links";

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
  slug?: string;
}

const statusStyle: Record<TechArticleProps["status"], string> = {
  "Documented": "bg-honey/10 text-honey-text",
  "In development": "bg-ping-violet/10 text-ping-violet",
  "Direction": "bg-surface-muted text-text-muted",
};

export function TechArticle({ eyebrow, title, lede, status, sections, related, slug }: TechArticleProps) {
  // BreadcrumbList (Wave 17, B-14): Home / Technology / this page, using
  // the real page title the article renders as its heading. Pages opt in
  // by passing their route slug; the shared builders in
  // @/lib/structured-data generate the JSON-LD.
  const tenant = getTenant();
  const siteUrl =
    tenant.domain ??
    (process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "https://pingfyd.com");
  const breadcrumbJsonLd = slug
    ? buildBreadcrumbJsonLd([
        { name: "Home", url: siteUrl },
        { name: "Technology", url: siteUrl + "/technology" },
        { name: title, url: siteUrl + "/technology/" + slug },
      ])
    : null;
  // From the studio notebook (Wave 18, B-10): reverse internal links to
  // the essays that genuinely belong with this page. The mapping in
  // @/lib/essay-links holds slugs only; titles and excerpts come from
  // the blog data layer, so they cannot drift from the posts. A page
  // with no mapped essays renders no section at all.
  const notebookPosts = slug
    ? getEssaySlugsForTechPage(slug)
        .map((s) => getAllPosts().find((p) => p.slug === s))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
    : [];
  return (
    <>
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      ) : null}

      <Section className="bg-deep">
        <Container className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-honey-text">{eyebrow}</p>
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
                <Reveal><h2 className="text-2xl font-bold text-text">{s.heading}</h2></Reveal>
                <div className="mt-3 space-y-4 text-text-muted" style={{ lineHeight: 'var(--leading-body)' }}>
                  {s.body}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-12 border-t border-border-soft pt-8">
            <Reveal><h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">Related</h3></Reveal>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="font-medium text-honey-text hover:underline">{r.label} →</Link>
                </li>
              ))}
            </ul>
          </div>
          {notebookPosts.length > 0 ? (
            <div className="mt-12 border-t border-border-soft pt-8">
              <Reveal><h3 className="text-sm font-semibold uppercase tracking-wide text-text-subtle">From the studio notebook</h3></Reveal>
              <ul className="mt-4 space-y-6">
                {notebookPosts.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/blog/${p.slug}`} className="font-medium text-honey-text hover:underline">{p.title}</Link>
                    <p className="mt-1 text-text-muted" style={{ lineHeight: 'var(--leading-body)' }}>{p.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
