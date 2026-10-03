"use client";

import * as React from "react";

/** Host controls only; events inside a sandboxed website frame do not bubble here. */
export function useObjectDialog(
  ref: React.RefObject<HTMLElement | null>,
  present: boolean,
  stage: string,
  onClose: () => void,
) {
  // Tracks the last presented stage so expanding compact<->full does not
  // steal focus the user already placed inside the dialog.
  const lastStageRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!present || !ref.current) return;
    const root = ref.current;
    const stageChanged = lastStageRef.current !== null && lastStageRef.current !== stage;
    lastStageRef.current = stage;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], summary, [tabindex="0"]',
    )).filter((el) => el.getClientRects().length > 0);
    const focusFirst = () => (root.querySelector<HTMLElement>("[data-object-close]") ?? controls()[0] ?? root)
      .focus({ preventScroll: true });
    // Move focus into the dialog only when it newly presents; a stage
    // transition keeps whatever the user already focused.
    if (!stageChanged) focusFirst();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!root.contains(event.target as Node)) focusFirst();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [ref, present, stage, onClose]);
}
