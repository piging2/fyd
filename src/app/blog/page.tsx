import type { Metadata } from "next";
import { BlogArchive } from "@/components/blog-archive";
import { Container, Section, SectionHeading } from "@/components/section";
import { getAllPosts } from "@/lib/blog";
import { episodeVideos, shortVideos } from "@/lib/longping-media";
import { VideoCard } from "@/components/video-card";
import { SocialsHub } from "@/components/socials-hub";
import { CrossSell } from "@/components/cross-sell";
import { getFeaturedVideo } from "@/lib/latest-video";
import { getTenant } from "@/lib/tenant-config";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";

const siteUrl =
  getTenant().domain ??
  (process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : "https://pingfyd.com");

const DESCRIPTION =
  "PING build notes and The Long Ping on film: architecture, implementation, and the reasoning behind both, plus every episode with its Shorts and transcripts.";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Blog: Build Notes and Essays From PING",
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "Blog: Build Notes and Essays From PING · PING",
    description: DESCRIPTION,
    url: "/blog",
    images: [{ url: "/brand/og-card.webp", width: 1200, height: 630, alt: "PingFyd" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog: Build Notes and Essays From PING · PING",
    description: DESCRIPTION,
    images: ["/brand/og-card.webp"],
  },
};

export const revalidate = 3600;

export default async function BlogPage() {
  const featuredVideo = await getFeaturedVideo();
  const posts = getAllPosts();
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Blog", url: siteUrl + "/blog" },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Section className="bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            headingLevel="h1"
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
          <nav aria-label="Browse PING" className="mt-5 flex flex-wrap gap-x-6 gap-y-1">
            <a href="#long-ping-films" className="inline-flex min-h-11 items-center font-semibold text-honey underline underline-offset-4">
              Watch The Long Ping
            </a>
            <a href="#studio-notebook" className="inline-flex min-h-11 items-center font-semibold text-honey underline underline-offset-4">
              Browse the notebook
            </a>
          </nav>
        </Container>
      </Section>

      <Section size="minor" className="bg-surface-muted/40">
        <Container>
          <div id="long-ping-films" tabIndex={-1} data-fragment-focus>
            <SectionHeading
              eyebrow={<span className="text-honey-text">Watch</span>}
              title="The Long Ping, on film"
              description="Every episode is a full-length film on YouTube, an audio edition on Spotify, and a written transcript series on Substack. Start with the newest film, then take the Shorts as trailers for the arguments."
            />
          </div>

          <div className="mt-10">
            <VideoCard video={featuredVideo} large />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {episodeVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          <h3 className="mt-12 text-xl font-bold text-text">The Shorts</h3>
          <p className="mt-1 text-text-muted">
            Three short cuts from The Grid Problem, each a complete story on its own.
          </p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shortVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-5xl">
          <CrossSell />
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <h2 id="studio-notebook" tabIndex={-1} data-fragment-focus className="font-display text-3xl font-bold text-text">
            Studio notebook
          </h2>
          <BlogArchive posts={posts} />

          <div className="mt-16">
            <SocialsHub />
          </div>
        </Container>
      </Section>
    </>
  );
}
