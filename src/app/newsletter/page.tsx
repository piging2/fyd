import type { Metadata } from "next";
import Link from "next/link";
import { getTenant } from "@/lib/tenant-config";
import { Container, Section } from "@/components/section";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { getAllPosts } from "@/lib/blog";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://fyd-product.vercel.app");

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Notes on continuity, agents, business systems, and building PING in public. One email when there is something worth saying. No spam, no fluff. In your inbox.",
  alternates: { canonical: "/newsletter" },
  openGraph: {
    type: "website",
    title: "Newsletter · PING",
    description: "Notes on continuity, agents, business systems, and building PING in public. One email when there is something worth saying. No spam, no fluff. In your inbox.",
    url: siteUrl + "/newsletter",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-card.webp"],
    title: "Newsletter · PING",
    description: "Notes on continuity, agents, business systems, and building PING in public. One email when there is something worth saying. No spam, no fluff. In your inbox.",
  },
};

export default function NewsletterPage() {
  const latestPosts = getAllPosts().slice(0, 3);

  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent" style={{ letterSpacing: '0.12em' }}><span className="text-honey">Newsletter</span></p>
            <h1 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}><span className="text-text-on-dark">Follow the build</span></h1>
            <p className="mt-5 text-lg sm:text-xl text-text-muted" style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}><span className="text-text-on-dark/90">Notes on continuity, agents, business systems, and building PING in public. One email when there is something worth saying. No spam, no fluff. In your inbox.</span></p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-2xl">
          <div className="rounded-lg border border-border-soft bg-surface p-8">
            <h2 className="text-xl font-bold text-text">Get the notes</h2>
            <p className="mt-2 text-text-muted">
              Architecture decisions, implementation lessons, and practical automation thinking. Straight from the build.
            </p>
            <div className="mt-6">
              <NewsletterSignup />
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-border-soft bg-surface p-8">
            <h2 className="text-xl font-bold text-text">What lands in your inbox</h2>
            <p className="mt-2 text-text-muted">
              One email when there is something worth saying. No spam, no fluff.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-text-muted">
              <li>Notes on continuity, agents, business systems, and building PING in public.</li>
              <li>
                Architecture decisions, implementation lessons, and practical automation
                thinking, straight from the build.
              </li>
              <li>No spam, ever, and you can unsubscribe anytime.</li>
            </ul>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-bold text-text">Latest from the blog</h2>
            <div className="mt-4 space-y-4">
              {latestPosts.map((post) => (
                <article
                  key={post.slug}
                  className="rounded-lg border border-border-soft bg-surface p-6"
                >
                  <p className="text-sm text-text-muted">{formatDate(post.date)}</p>
                  <Link href={`/blog/${post.slug}`}>
                    <h3 className="mt-1 text-lg font-bold text-text hover:text-honey-text transition-colors">
                      {post.title}
                    </h3>
                  </Link>
                  <p className="mt-2 text-text-muted">{post.excerpt}</p>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-3 inline-block font-semibold text-honey-text hover:underline"
                  >
                    Read article
                  </Link>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-lg bg-surface-muted p-8 text-center">
            <h3 className="text-lg font-bold text-text">Archive</h3>
            <p className="mt-2 text-text-muted">
              The first issue is being written. Past notes will appear here as they are published.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
