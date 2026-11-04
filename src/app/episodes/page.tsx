import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { episodePages } from "@/lib/episodes";

const DESCRIPTION =
  "Every episode of The Long Ping with its own page: the film, its duration where the record has one, and the story it tells, with a link to watch on YouTube.";

export const metadata: Metadata = {
  title: "Episodes",
  description: DESCRIPTION,
  alternates: { canonical: "/episodes" },
  openGraph: {
    type: "website",
    title: "Episodes · PING",
    description: DESCRIPTION,
    url: "/episodes",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Episodes · PING",
    description: DESCRIPTION,
    images: ["/brand/og-card.webp"],
  },
};

export default function EpisodesPage() {
  return (
    <>
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            headingLevel="h1"
            eyebrow={<span className="text-honey">Watch</span>}
            title={<span className="text-text-on-dark">The Long Ping, episode by episode</span>}
            description={
              <span className="text-text-on-dark/90">
                Every long-form episode in the verified catalogue, each with its own
                page and a direct link to the film on YouTube. The Shorts live on
                the blog page as trailers for these arguments.
              </span>
            }
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {episodePages.map(({ slug, video }) => (
              <div
                key={video.id}
                className="overflow-hidden rounded-lg border border-border-soft bg-surface"
              >
                <Link href={"/episodes/" + slug} className="group block">
                  <div className="relative aspect-video w-full overflow-hidden bg-deep">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnailCard ?? video.thumbnail}
                      alt={video.title + " video thumbnail"}
                      loading="lazy"
                      width={1280}
                      height={720}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-3 top-3 inline-block rounded bg-deep/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-honey">
                      {video.kind}
                    </span>
                    {video.duration && (
                      <span className="absolute bottom-3 left-3 inline-block rounded bg-deep/85 px-3 py-1 text-xs font-semibold text-text-on-dark">
                        {video.duration}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <h2 className="text-lg font-bold text-text transition-colors group-hover:text-honey-text">
                      {video.title}
                    </h2>
                    <p className="mt-2 text-text-muted">{video.blurb}</p>
                  </div>
                </Link>
                <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 pb-5 font-medium">
                  <Link href={"/episodes/" + slug} className="text-accent hover:underline">
                    Episode page →
                  </Link>
                  <a
                    href={video.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Watch on YouTube →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
