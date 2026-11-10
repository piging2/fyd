type MascotGifProps = {
  gif: string;
  poster: string;
  width: number;
  height: number;
  alt: string;
  eager?: boolean;
  className?: string;
};

/**
 * The call-center GIF with its first frame as the still fallback.
 * Readers who prefer reduced motion get the poster frame instead of the
 * animation; everyone else gets the GIF. Width and height are always set,
 * so the frame reserves its space and the layout never shifts.
 */
export default function MascotGif({ gif, poster, width, height, alt, eager = false, className = "" }: MascotGifProps) {
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={poster} type="image/webp" />
      <img
        src={gif}
        width={width}
        height={height}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`h-auto w-full ${className}`}
      />
    </picture>
  );
}
