import { socialDestinations, substackSubscribeUrl } from "@/lib/longping-media";

/**
 * The interconnected socials hub: every verified place PING and
 * The Long Ping live, in one follow/connect block. Used on the blog
 * index and at the foot of every blog post.
 */
export function SocialsHub() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-text">Follow PING everywhere</h2>
      <p className="mt-2 text-text-muted">
        The show, the build, and the business are the same story told in different
        places. Watch the films on YouTube, hear the episodes on Spotify, read the
        transcripts and essays on Substack, and argue with all of it wherever you
        already spend your scroll.
      </p>

      <div className="mt-6 rounded-lg bg-deep p-5 sm:p-6">
        <h3 className="text-lg font-bold text-text-on-dark">Get The Long Ping in your inbox</h3>
        <p className="mt-1 text-text-on-dark/85">
          PING on Substack carries the full transcripts, the companion essays, and
          the build notes, ad-free, delivered by email. Free while the audience is
          growing; subscribe once and every episode finds you.
        </p>
        <a
          href={substackSubscribeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-honey px-6 py-3 font-semibold text-deep transition-colors hover:bg-honey/90"
        >
          Subscribe on Substack
        </a>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {socialDestinations.map((dest) => (
          <a
            key={dest.platform}
            href={dest.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border-soft bg-background p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-text transition-colors group-hover:text-honey-text">
                {dest.platform}
              </span>
              <span className="text-sm font-semibold text-honey-text">{dest.label}</span>
            </div>
            <p className="mt-1.5 text-sm text-text-muted">{dest.blurb}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
