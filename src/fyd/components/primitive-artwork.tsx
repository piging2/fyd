import { EditorialSymbol, resolveSymbol } from "./editorial-symbols";
import "./primitive-artwork.css";

/** Reuse the three completed material studies; other concepts keep their existing symbols.
 * Artwork explains a concept. It never represents the state of a business record.
 */
export function PrimitiveArtwork({ concept = "continuity", phase = 2, className = "", eager = false, priority = false }: {
  concept?: string; phase?: number; className?: string; eager?: boolean; priority?: boolean;
}) {
  const name = resolveSymbol(concept);
  if (name !== "continuity" && name !== "evidence" && name !== "knowledge") {
    return <EditorialSymbol concept={concept} phase={phase} className={className}/>;
  }
  const frame = Math.max(0, Math.min(2, Math.round(phase)));
  return <span className={`pg-artwork ${className}`} data-artwork={name} data-phase={frame} aria-hidden="true">
    <img src={`/art/primitives/${name}.webp`} alt="" width={1536} height={512}
      loading={eager ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
      decoding="async" draggable={false} style={{ transform: `translateX(-${frame * 100 / 3}%)` }}/>
  </span>;
}
