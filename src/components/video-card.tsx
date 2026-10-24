"use client";

import { useState } from "react";
import type { FeaturedVideo } from "@/lib/longping-media";

/**
 * A thumbnail card that links out to the video on YouTube.
 * Uses a plain <img> (YouTube's thumbnail CDN is not in next/image
 * remotePatterns) with an hqdefault fallback if the maxres still is absent.
 */
export function VideoCard({ video, large = false }: { video: FeaturedVideo; large?: boolean }) {
  const [src, setSrc] = useState(video.thumbnail);

  return (
    <a
      href={video.watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-border-soft bg-surface transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-deep">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${video.title} video thumbnail`}
          loading="lazy"
          width={1280}
          height={720}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          onError={() => {
            if (video.thumbnailFallback && src !== video.thumbnailFallback) {
              setSrc(video.thumbnailFallback);
            }
          }}
        />
        <span className="absolute left-3 top-3 inline-block rounded bg-deep/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-honey">
          {video.kind}
        </span>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded bg-deep/85 px-3 py-1 text-xs font-semibold text-text-on-dark">
          Watch on YouTube
        </span>
      </div>
      <div className={large ? "p-6" : "p-5"}>
        <h3
          className={
            large
              ? "text-2xl font-bold text-text transition-colors group-hover:text-honey-text"
              : "text-lg font-bold text-text transition-colors group-hover:text-honey-text"
          }
        >
          {video.title}
        </h3>
        <p className="mt-2 text-text-muted">{video.blurb}</p>
      </div>
    </a>
  );
}
