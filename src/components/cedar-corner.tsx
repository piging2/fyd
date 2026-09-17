import { cn } from "@/lib/utils";

/**
 * CedarCorner — the brand's repeated visual signature (CEO: "cedar-inspired
 * corner accents"). A small organic L-shaped cedar mark. Placed on the logo,
 * cards, and section transitions so the brand is recognizable even without the
 * wordmark. Decorative.
 */
export function CedarCorner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("block", className)}
      fill="none"
    >
      <path
        d="M2 14 C2 7 7 2 14 2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M5 14 C5 9 9 5 14 5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* tiny cedar leaf */}
      <path d="M2 14 q4 -1 6 -4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
