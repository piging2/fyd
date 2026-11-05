import { socialDestinations } from "@/lib/longping-media";

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
        Every other place PING and The Long Ping live, in one block.
      </p>

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
