import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/section";
import { getPost } from "@/lib/blog";
import { buildEpisodeDepth, buildEpisodePageTitle, durationToIso8601, embedUrlFor, episodePages, getEpisodePage } from "@/lib/episodes";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
import { getTenant } from "@/lib/tenant-config";

export async function generateStaticParams() {
  return episodePages.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEpisodePage(slug);
  if (!entry) return { title: "Episode Not Found" };
  const { video } = entry;
  const pageTitle = buildEpisodePageTitle(entry);
  return {
    title: pageTitle,
    description: entry.description,
    alternates: { canonical: "/episodes/" + slug },
    openGraph: {
      type: "video.other",
      title: pageTitle + " · PING",
      description: entry.description,
      url: "/episodes/" + slug,
      images: [{ url: video.thumbnail, alt: video.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle + " · PING",
      description: entry.description,
      images: [video.thumbnail],
    },
  };
}

export default async function EpisodeLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getEpisodePage(slug);
  if (!entry) {
    notFound();
  }
  const { video } = entry;
  // The engineering breakdown is the published blog post that shares this
  // episode slug. If that slug ever stops resolving, the section below is
  // skipped rather than linking to a page that does not exist.
  const breakdown = getPost(slug);
  // Depth sections (summary, topics, excerpt) are derived from that same
  // post body by the episodes data module. A post that stops resolving,
  // or yields no depth, renders no depth sections (dangling data guard).
  const depth = breakdown ? buildEpisodeDepth(breakdown.body) : null;
  const tenant = getTenant();
  const siteUrl =
    tenant.domain ??
    (process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "https://fyd-product.vercel.app");
  const isoDuration = durationToIso8601(video.duration);

  // VideoObject carries only fields the media inventory actually supports.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: entry.description,
    url: video.watchUrl,
    embedUrl: embedUrlFor(video),
    thumbnailUrl: [video.thumbnail],
  };
  if (isoDuration) {
    jsonLd.duration = isoDuration;
  }

  const idx = episodePages.findIndex((e) => e.slug === slug);
  const prev = idx > 0 ? episodePages[idx - 1] : null;
  const next = idx >= 0 && idx < episodePages.length - 1 ? episodePages[idx + 1] : null;

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Episodes", url: siteUrl + "/episodes" },
    { name: video.title, url: siteUrl + "/episodes/" + slug },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <Link href="/episodes" className="text-honey-text hover:underline text-sm font-semibold">
            Back to all episodes
          </Link>
          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-block px-3 py-1 bg-honey/10 text-honey-text rounded text-sm font-semibold">
              {video.kind}
            </span>
            {video.duration && (
              <span className="inline-block px-3 py-1 bg-honey/10 text-honey-text rounded text-sm font-semibold">
                {video.duration}
              </span>
            )}
          </div>
          <h1 className="font-display text-4xl font-bold text-text-on-dark sm:text-5xl">
            {video.title}
          </h1>
          <p className="mt-4 max-w-2xl text-text-on-dark/90">{video.blurb}</p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-deep">
            <iframe
              src={embedUrlFor(video)}
              title={video.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 font-medium">
            <a
              href={video.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Watch on YouTube →
            </a>
            <span className="text-text-muted">
              {siteUrl.replace("https://", "")}/episodes/{slug}
            </span>
          </div>

          {breakdown && (
            <div className="mt-12 rounded-lg border border-border-soft p-5">
              <h2 className="text-2xl font-bold text-text">Read the engineering breakdown</h2>
              <p className="mt-3 font-bold text-text">{breakdown.title}</p>
              <p className="mt-2 text-text-muted">{breakdown.excerpt}</p>
              <p className="mt-4 font-medium">
                <Link href={"/blog/" + breakdown.slug} className="text-accent hover:underline">
                  Read the breakdown →
                </Link>
              </p>
            </div>
          )}

          {depth && breakdown && (
            <div className="mt-12 space-y-10">
              <div>
                <h2 className="text-2xl font-bold text-text">Episode summary</h2>
                <p className="mt-2 text-sm font-semibold text-text-muted">
                  Summary from the written breakdown for this episode.
                </p>
                <p className="mt-3 text-text-muted">{depth.summary}</p>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-text">Topics in this episode</h2>
                <p className="mt-2 text-sm font-semibold text-text-muted">
                  The section headings of the written breakdown. The breakdown
                  renders no heading anchors, so each topic links to the post.
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-6 text-text-muted">
                  {depth.topics.map((topic) => (
                    <li key={topic}>
                      <Link href={"/blog/" + breakdown.slug} className="text-accent hover:underline">
                        {topic}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-text">From the written breakdown</h2>
                <blockquote className="mt-3 border-l-4 border-honey pl-4 italic text-text-muted">
                  {depth.excerpt}
                </blockquote>
                <p className="mt-4 font-medium">
                  <Link href={"/blog/" + breakdown.slug} className="text-accent hover:underline">
                    Read the full breakdown →
                  </Link>
                </p>
              </div>
            </div>
          )}

          {(prev || next) && (
            <nav aria-label="More episodes of The Long Ping" className="mt-12 grid gap-4 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={"/episodes/" + prev.slug}
                  className="rounded-lg border border-border-soft p-5 hover:border-honey"
                >
                  <span className="text-sm font-semibold text-text-muted">Previous episode</span>
                  <span className="mt-1 block font-bold text-text">{prev.video.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={"/episodes/" + next.slug}
                  className="rounded-lg border border-border-soft p-5 text-right hover:border-honey"
                >
                  <span className="text-sm font-semibold text-text-muted">Next episode</span>
                  <span className="mt-1 block font-bold text-text">{next.video.title}</span>
                </Link>
              )}
            </nav>
          )}
        </Container>
      </Section>
    </>
  );
}
