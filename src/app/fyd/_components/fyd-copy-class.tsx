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
  live: "bg-green-500/10 text-green-700 border-green-500/30",
  auth: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  coming: "bg-amber-500/10 text-amber-700 border-amber-500/30",
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
}: {
  kind: FydCopyClass;
  className?: string;
}) {
  return (
    <span
      title={HINTS[kind]}
      className={cn(
        "inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STYLES[kind],
        className
      )}
    >
      {LABELS[kind]}
    </span>
  );
}
