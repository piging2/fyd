import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/section";
import { getAllSlugs, getPost, renderMarkdown } from "@/lib/blog";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Article Not Found" };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
  };
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <Link href="/blog" className="text-honey hover:underline text-sm font-semibold">
            Back to all articles
          </Link>
          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-3 py-1 bg-honey/10 text-honey rounded text-sm font-semibold"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            {post.title}
          </h1>
          <div className="mt-4 text-text-on-dark/80">{formatDate(post.date)}</div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <article dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />

          <div className="mt-12 pt-8 border-t border-border-soft">
            <h3 className="text-xl font-bold text-text mb-4">Questions about PING?</h3>
            <p className="text-text-muted mb-6">
              These notes document real architecture and real implementation. If
              something here is useful for your business, get in touch.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-lg bg-honey px-6 py-3 font-semibold text-deep transition-colors hover:bg-honey/90"
            >
              Contact PING
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}
