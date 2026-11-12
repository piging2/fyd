"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type EpisodePlayerProps = {
  title: string;
  embedUrl: string;
  poster?: string;
  fallbackPoster?: string;
  duration?: string;
};

type PlayerPhase = "poster" | "requested" | "loaded" | "unavailable";

const PLAYER_LABELS: Record<PlayerPhase, string> = {
  poster: "Load episode player",
  requested: "Requesting player…",
  loaded: "Reload player",
  unavailable: "Retry player",
};

export function EpisodePlayer({ title, embedUrl, poster, fallbackPoster, duration }: EpisodePlayerProps) {
  const playerId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const posterImage = useRef<HTMLImageElement>(null);
  const [interactive, setInteractive] = useState(false);
  const [phase, setPhase] = useState<PlayerPhase>("poster");
  const [attempt, setAttempt] = useState(0);
  const [posterSource, setPosterSource] = useState(poster ?? "");
  // A slow or failed request remains mounted so a late load can recover and
  // keyboard focus inside the player survives the warning. Only an explicit
  // reload/retry replaces the frame through its attempt key.
  const showFrame = phase !== "poster";

  const handlePosterFailure = useCallback(() => {
    setPosterSource((current) => {
      if (fallbackPoster && current !== fallbackPoster) return fallbackPoster;
      return "";
    });
  }, [fallbackPoster]);

  useEffect(() => {
    const image = posterImage.current;
    if (image?.complete && image.naturalWidth === 0) handlePosterFailure();
  }, [posterSource, showFrame, handlePosterFailure]);

  useEffect(() => setInteractive(true), []);

  useEffect(() => {
    if (phase !== "requested") return;
    const timeout = window.setTimeout(() => setPhase("unavailable"), 15000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  function requestPlayer() {
    if (phase === "requested") return;
    setPhase("requested");
    setAttempt((value) => value + 1);
  }

  return (
    <>
      <div
        id={playerId}
        aria-busy={phase === "requested"}
        className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-lg bg-deep"
      >
        {showFrame ? (
          <iframe
            key={attempt}
            ref={frame}
            src={embedUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setPhase("loaded")}
            onError={() => setPhase("unavailable")}
          />
        ) : (
          <>
            <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-text-on-dark">
              <p className="font-mono text-xs uppercase tracking-widest text-honey">The Long Ping</p>
              <p className="max-w-xl font-display text-xl font-bold sm:text-3xl">{title}</p>
            </div>
            {posterSource && (
              <img
                ref={posterImage}
                src={posterSource}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
                loading="lazy"
                decoding="async"
                onError={handlePosterFailure}
              />
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={requestPlayer}
          disabled={!interactive}
          aria-disabled={phase === "requested"}
          aria-controls={playerId}
          className="min-h-11 rounded-full bg-honey px-5 py-2 font-semibold text-honey-foreground hover:bg-honey-hover focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60 aria-disabled:opacity-60"
        >
          {PLAYER_LABELS[phase]}
        </button>
        {phase === "loaded" && (
          <button
            type="button"
            onClick={() => frame.current?.focus()}
            className="min-h-11 rounded px-2 font-semibold text-honey-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Go to video player
          </button>
        )}
        {duration && <span className="text-sm text-text-muted">{duration}</span>}
      </div>
      <p role="status" className="mt-2 text-sm text-text-muted">
        {phase === "requested" && "Requesting the YouTube player…"}
        {phase === "unavailable" && "The player is taking longer than expected. You can keep waiting, retry, or watch on YouTube below."}
        {phase === "loaded" && "If playback is unavailable, watch on YouTube below."}
      </p>
      <noscript>
        <p className="mt-2 text-sm text-text-muted">Use Watch on YouTube below to play this episode.</p>
      </noscript>
    </>
  );
}
