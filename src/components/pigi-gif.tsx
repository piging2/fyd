"use client";

import { useEffect, useState } from "react";

type PigiGifProps = {
  gif: string;
  poster: string;
  width: number;
  height: number;
  alt: string;
  eager?: boolean;
  className?: string;
};

export default function PigiGif({ gif, poster, width, height, alt, eager = false, className = "" }: PigiGifProps) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function handleChange() {
      if (preference.matches) setPlaying(false);
    }
    preference.addEventListener("change", handleChange);
    return () => preference.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      <img
        src={playing ? gif : poster}
        width={width}
        height={height}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={"h-auto w-full " + className}
      />
      <div className="flex justify-end border-t border-border-soft px-3">
        <button
          type="button"
          className="min-h-11 rounded px-2 text-sm font-semibold text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? "Show still" : "Play mascot animation"}
        </button>
      </div>
    </>
  );
}
