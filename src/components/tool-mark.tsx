/**
 * ToolMark — a tiny carpenter-square glyph used as a quiet section eyebrow
 * accent. Calm, confident craft signal (no flashy illustration).
 */
export function ToolMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 3v18h14" />
      <path d="M5 3h14" />
      <path d="M9 7h6v6" opacity={0.55} />
    </svg>
  );
}
