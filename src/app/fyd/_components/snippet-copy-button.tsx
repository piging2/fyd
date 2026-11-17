"use client";

/*
 * Copy control for the published install snippet (PING-6).
 *
 * Why this exists: the snippet is a contract. A publisher who copies it
 * with a stray character or a truncated line gets a circle that fails
 * closed and no signal about why. The button copies the exact string the
 * server rendered (passed in as a prop from the same SNIPPET constant the
 * visible block renders, so the two can never drift). When the browser
 * denies clipboard access, the control says so plainly and selects the
 * rendered code so the publisher can copy it manually; it never reports
 * a success that did not happen.
 */

import { useState } from "react";

export function SnippetCopyButton({
  snippet,
  targetId,
}: {
  snippet: string;
  targetId: string;
}) {
  const [status, setStatus] = useState("");

  async function onCopy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(snippet);
        setStatus("Copied. Paste it where your circle should appear.");
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      // Clipboard denied or unavailable: fall back to manual selection of
      // the rendered snippet and say exactly what happened.
      try {
        const el = document.getElementById(targetId);
        if (el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch {
        // Selection is a courtesy fallback; failing it changes nothing
        // about the honesty of the status message below.
      }
      setStatus(
        "Copy was blocked by the browser, so the snippet is selected instead. Press Ctrl+C (Cmd+C on a Mac) to copy it."
      );
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
      <span aria-live="polite" className="text-sm text-text-muted">
        {status}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="min-h-11 rounded-full border border-border-soft bg-surface px-5 text-sm font-semibold text-text"
      >
        Copy the snippet
      </button>
    </div>
  );
}
