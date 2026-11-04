import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section } from "@/components/section";
import { durationToIso8601, embedUrlFor, episodePages, getEpisodePage } from "@/lib/episodes";
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
  return {
    title: video.title,
    description: video.blurb,
    alternates: { canonical: "/episodes/" + slug },
    openGraph: {
      type: "video.other",
      title: video.title,
      description: video.blurb,
      url: "/episodes/" + slug,
      images: [{ url: video.thumbnail, alt: video.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: video.title,
      description: video.blurb,
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
    description: video.blurb,
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
