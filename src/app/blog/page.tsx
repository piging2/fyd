import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description: "PING build notes: architecture, implementation, and the reasoning behind both.",
  alternates: { canonical: "/blog" },
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">Blog</span>}
            title={<span className="text-text-on-dark">Build notes</span>}
            description={
              <span className="text-text-on-dark/90">
                Real notes from building PING: the architecture, the implementation
                decisions, and the reasoning behind both. No hype, no vague
                superlatives, just what was built and why.
              </span>
            }
          />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <div className="space-y-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="rounded-lg border border-border-soft bg-surface p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="inline-block px-3 py-1 bg-honey/10 text-honey rounded text-sm font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-sm text-text-muted">{formatDate(post.date)}</span>
                </div>
                <Link href={`/blog/${post.slug}`}>
                  <h2 className="text-2xl font-bold text-text hover:text-honey transition-colors">
                    {post.title}
                  </h2>
                </Link>
                <p className="mt-2 text-text-muted">{post.excerpt}</p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-4 inline-block font-semibold text-honey hover:underline"
                >
                  Read article
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
