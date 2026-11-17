"use client";

/*
 * Public thumbnail with a complete failure policy (PING-7).
 *
 * Why this exists: a video card whose remote thumbnail fails used to end
 * in a broken image (the card component swapped to its fallback once and
 * then kept the broken element; the episodes grid had no error state at
 * all). The episode player already established the house policy: prefer
 * the best image, fall back once to the approved lighter variant, and if
 * that also fails, end in a deliberate non-image state instead of a
 * broken one. This island applies the same policy to card thumbnails:
 * the terminal state is a branded text poster carrying the video title,
 * in the same box, so card geometry, title semantics, and the watch
 * destination survive a thumbnail outage. The video itself is never
 * described as unavailable; only its picture failed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function ThumbnailImage({
  preferred,
  fallback,
  title,
  className,
}: {
  preferred: string;
  fallback?: string;
  title: string;
  className?: string;
}) {
  const [source, setSource] = useState(preferred);
  const image = useRef<HTMLImageElement>(null);

  const handleFailure = useCallback(() => {
    setSource((current) => {
      if (fallback && current !== fallback) return fallback;
      return "";
    });
  }, [fallback]);

  // A cached failure can complete before hydration attaches onError;
  // the player checks the same condition, so check it here too.
  useEffect(() => {
    const img = image.current;
    if (img?.complete && img.naturalWidth === 0) handleFailure();
  }, [source, handleFailure]);

  if (source === "") {
    return (
      <div
        role="img"
        aria-label={`${title} video thumbnail`}
        className="flex h-full w-full items-center justify-center bg-deep p-6 text-center"
      >
        <span className="text-lg font-bold leading-snug text-text-on-dark">
          {title}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={source}
      alt={`${title} video thumbnail`}
      loading="lazy"
      width={1280}
      height={720}
      className={className}
      onError={handleFailure}
    />
  );
}
