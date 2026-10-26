import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/section";
import { getAllPosts, getAllSlugs, getPost, renderMarkdown } from "@/lib/blog";
import { episodeVideos, featuredFilm } from "@/lib/longping-media";
import { getTenant } from "@/lib/tenant-config";
import { SocialsHub } from "@/components/socials-hub";

/** The Long Ping episodes in series order, for prev/next navigation and
 *  per-episode share images. Video entries come from the verified media
 *  inventory in @/lib/longping-media. */
const EPISODE_ORDER: { slug: string; videoId: string }[] = [
  { slug: "what-survives-10000-years", videoId: "ekJnwDb7ssw" },
  { slug: "the-water-wheel-problem", videoId: "ibgccWqthsw" },
  { slug: "the-grid-problem", videoId: "s3Os1RNAmeo" },
];

function episodeImage(slug: string): string {
  const entry = EPISODE_ORDER.find((e) => e.slug === slug);
  if (!entry) return "/brand/og-card.png";
  const video =
    entry.videoId === featuredFilm.id
      ? featuredFilm
      : episodeVideos.find((v) => v.id === entry.videoId);
  return video?.thumbnail ?? "/brand/og-card.png";
}

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

  const image = episodeImage(slug);
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `/blog/${slug}`,
      publishedTime: post.date,
      tags: post.tags,
      images: [{ url: image, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [image],
    },
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

  const tenant = getTenant();
  const siteUrl =
    tenant.domain ??
    (process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "https://ping.vercel.app");
  const shareImage = episodeImage(slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    url: `${siteUrl}/blog/${slug}`,
    image: shareImage.startsWith("http") ? shareImage : siteUrl + shareImage,
    author: { "@type": "Organization", name: tenant.siteName, url: siteUrl },
    publisher: { "@type": "Organization", name: tenant.siteName, url: siteUrl },
  };

  const episodeIndex = EPISODE_ORDER.findIndex((e) => e.slug === slug);
  const prevEpisode =
    episodeIndex > 0 ? getPost(EPISODE_ORDER[episodeIndex - 1].slug) : null;
  const nextEpisode =
    episodeIndex >= 0 && episodeIndex < EPISODE_ORDER.length - 1
      ? getPost(EPISODE_ORDER[episodeIndex + 1].slug)
      : null;

  const allPosts = getAllPosts().filter((p) => p.slug !== slug);
  const related = [
    ...allPosts.filter((p) => p.tags.some((t) => post.tags.includes(t))),
    ...allPosts.filter((p) => !p.tags.some((t) => post.tags.includes(t))),
  ].slice(0, 2);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <Link href="/blog" className="text-honey-text hover:underline text-sm font-semibold">
            Back to all articles
          </Link>
          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-3 py-1 bg-honey/10 text-honey-text rounded text-sm font-semibold"
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

          {(prevEpisode || nextEpisode) && (
            <nav
              aria-label="More episodes of The Long Ping"
              className="mt-12 grid gap-4 sm:grid-cols-2"
            >
              {prevEpisode ? (
                <Link
                  href={`/blog/${prevEpisode.slug}`}
                  className="rounded-lg border border-border-soft p-5 hover:border-honey"
                >
                  <span className="text-sm font-semibold text-text-muted">
                    Previous episode
                  </span>
                  <span className="mt-1 block font-bold text-text">
                    {prevEpisode.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {nextEpisode && (
                <Link
                  href={`/blog/${nextEpisode.slug}`}
                  className="rounded-lg border border-border-soft p-5 text-right hover:border-honey"
                >
                  <span className="text-sm font-semibold text-text-muted">
                    Next episode
                  </span>
                  <span className="mt-1 block font-bold text-text">
                    {nextEpisode.title}
                  </span>
                </Link>
              )}
            </nav>
          )}

          {related.length > 0 && (
            <div className="mt-12">
              <h3 className="text-xl font-bold text-text mb-4">Keep reading</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {related.map((rel) => (
                  <Link
                    key={rel.slug}
                    href={`/blog/${rel.slug}`}
                    className="rounded-lg border border-border-soft p-5 hover:border-honey"
                  >
                    <span className="block font-bold text-text">{rel.title}</span>
                    <span className="mt-2 block text-sm text-text-muted">
                      {rel.excerpt}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12">
            <SocialsHub />
          </div>

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
