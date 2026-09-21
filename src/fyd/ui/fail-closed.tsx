"use client";

/**
 * Fail-closed projection: the customer-surface implementation of the
 * harvest-spec rule "explicit Unavailable state instead of zero" (X-24)
 * and the not-to-copy rule against silent zeros / fake "all clear" (13.6).
 *
 * A projection that cannot read its data renders as Unknown or
 * Unavailable. It never renders a fake healthy value, never renders an
 * empty success state, and never silently renders zero. Zero is a number;
 * it renders only when the evidence actually says zero.
 */

import type { ReactNode } from "react";

export type ProjectionReadState = "ok" | "unknown" | "unavailable";

export function FailClosed({
  state,
  children,
  label,
  className,
}: {
  state: ProjectionReadState;
  children: ReactNode;
  /** What failed to read, e.g. "Opening hours". Shown in the honest state. */
  label?: string;
  className?: string;
}) {
  if (state === "ok") return <>{children}</>;
  const text =
    state === "unavailable"
      ? (label ? `${label} unavailable` : "Unavailable")
      : (label ? `${label} unknown` : "Unknown");
  return (
    <span
      role="status"
      title={
        state === "unavailable"
          ? "FYD could not read this. It is not the same as none."
          : "FYD has no evidence for this either way."
      }
      className={
        "inline-block rounded border border-dashed border-zinc-400/60 bg-zinc-500/5 px-2 py-0.5 text-xs text-zinc-600 " +
        (className ?? "")
      }
    >
      {text}
    </span>
  );
}
