import { substackSubscribeUrl } from "@/lib/longping-media";

const SUBSTACK_HOME = "https://trustping.substack.com";
const YOUTUBE_CHANNEL = "https://www.youtube.com/channel/UCsl7RnATG9bn--EWh2davTQ";

/**
 * The grouped cross-sell: written content together selling Substack,
 * video together selling YouTube, each panel cross-linking the other.
 * This is the one Substack conversion block per page; the SocialsHub
 * below it is the plain destination grid.
 */
export function CrossSell() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-lg bg-deep p-6 sm:p-8">
        <span className="font-semibold uppercase tracking-widest text-honey">Read</span>
        <h3 className="mt-2 text-2xl font-bold text-text-on-dark">Read on Substack</h3>
        <p className="mt-2 text-text-on-dark/85">
          Want more quality written content? More on Substack. Every film ships
          with a full written edition: the complete transcripts, the companion
          essays, and the build notes, published ad-free.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={SUBSTACK_HOME}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-honey px-6 py-3 font-semibold text-deep transition-colors hover:bg-honey/90"
          >
            Read on Substack
          </a>
          <a
            href={substackSubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-honey underline-offset-4 hover:underline"
          >
            Subscribe free by email
          </a>
        </div>
        <p className="mt-5 text-sm text-text-on-dark/70">
          More of a watcher?{" "}
          <a href={YOUTUBE_CHANNEL} target="_blank" rel="noopener noreferrer" className="font-semibold text-honey underline-offset-4 hover:underline">
            Watch the films on YouTube
          </a>
        </p>
      </div>

      <div className="rounded-lg border-t-4 border-cavern-clay bg-deep p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-widest text-text-on-dark/70">
          <span className="grid h-5 w-5 place-items-center rounded bg-cavern-clay text-[10px] text-white">&#9654;</span>
          Watch
        </span>
        <h3 className="mt-2 text-2xl font-bold text-text-on-dark">Watch on YouTube</h3>
        <p className="mt-2 text-text-on-dark/85">
          Every episode of The Long Ping is a full-length film, free in full:
          the water wheel, the grid, the retry that charged twice, plus the
          Shorts that trailer the arguments.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={YOUTUBE_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-text-on-dark px-6 py-3 font-semibold text-deep transition-colors hover:bg-text-on-dark/90"
          >
            Watch on YouTube
          </a>
          <a
            href="/episodes"
            className="font-semibold text-honey underline-offset-4 hover:underline"
          >
            Browse the episode pages
          </a>
        </div>
        <p className="mt-5 text-sm text-text-on-dark/70">
          More of a reader?{" "}
          <a href={SUBSTACK_HOME} target="_blank" rel="noopener noreferrer" className="font-semibold text-honey underline-offset-4 hover:underline">
            Read the written editions on Substack
          </a>
        </p>
      </div>
    </div>
  );
}
