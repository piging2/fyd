import { cn } from "@/lib/utils";

/**
 * FYD copy classes (binding): every capability claim on the /fyd product
 * surface carries one. Visual grammar converges with the shared
 * MaturityLabel, but the classes are FYD product law, not PING internals.
 */
export type FydCopyClass = "live" | "auth" | "coming" | "vision";

const LABELS: Record<FydCopyClass, string> = {
  live: "Live now",
  auth: "Available with owner authorization",
  coming: "Coming",
  vision: "Long-term vision",
};

const STYLES: Record<FydCopyClass, string> = {
  live: "bg-green-500/10 text-green-800 border-green-500/30",
  auth: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  coming: "bg-amber-500/10 text-amber-800 border-amber-500/30",
  vision: "bg-surface-muted text-text-muted border-border-soft",
};

// Dark-section variants for bg-deep surfaces: the light styles measure
// below the 4.5:1 AA bar for badge-size text on deep (green-700 3.01:1,
// amber-700 2.97:1, tint-composite method), so bg-deep sections pass onDark
// and get the 400 step, which measures above 7:1 on deep. The light styles
// above measure above 5.4:1 on every light surface these badges render on
// (surface, background, surface-2, and honey-card composites). Vision is an
// opaque chip whose text/background pair is its own, so it is unchanged.
const DARK_STYLES: Record<FydCopyClass, string> = {
  live: "bg-green-500/10 text-green-400 border-green-500/30",
  auth: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  coming: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  vision: "bg-surface-muted text-text-muted border-border-soft",
};

const HINTS: Record<FydCopyClass, string> = {
  live: "Proven current behavior on this server",
  auth: "Built, but only runs with the owner's explicit approval",
  coming: "Product direction, not built yet",
  vision: "Long-term network direction, not built yet",
};

export function FydCopyClassLabel({
  kind,
  className,
  onDark,
}: {
  kind: FydCopyClass;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      title={HINTS[kind]}
      className={cn(
        "inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        onDark ? DARK_STYLES[kind] : STYLES[kind],
        className
      )}
    >
      {LABELS[kind]}
    </span>
  );
}
