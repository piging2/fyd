/**
 * Object continuity: animate the object, never decoration.
 *
 * Glyph -> (tap) -> Peek -> (expand) -> Workspace: the avatar/logo,
 * title, and identity visually persist through the transition so the
 * user feels "I expanded the same object", not "I navigated to another
 * page". The mechanism is the same-document View Transition API with
 * shared view-transition-name identity elements.
 *
 * Progressive enhancement, hard rule: correctness never depends on
 * animation support. No startViewTransition, or prefers-reduced-motion,
 * means the state update runs synchronously with no transition.
 *
 * Semantic motion only: transitions here serve EXPAND (peek ->
 * workspace) and ENTER/EXIT (sheet in/out). The default root
 * crossfade is disabled by the layer stylesheet so only named shared
 * elements animate; everything else cuts.
 */

import { flushSync } from "react-dom";

type StartViewTransition = (
  update: () => void,
) => { finished: Promise<void> };

/** Shared identity name for one object's glyph/peek/workspace faces.
 * Sanitized: view-transition-name takes a CSS custom ident, so spaces,
 * slashes, and case are normalized to a stable lowercase slug. */
export function identityTransitionName(objectId: string): string {
  const slug = objectId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `fyd-identity-${slug || "object"}`;
}

/** Reduced-motion signal, read live (SSR-safe). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startTransition(update: () => void): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as Document & {
    startViewTransition?: StartViewTransition;
  };
  if (typeof doc.startViewTransition !== "function") return false;
  try {
    doc.startViewTransition(() => {
      flushSync(update);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a state update inside a same-document View Transition when the
 * browser supports it and the user has not asked for reduced motion.
 * Falls back to a synchronous update otherwise: the UI is correct
 * with or without the animation.
 */
export function transitionViews(update: () => void): void {
  if (prefersReducedMotion()) {
    update();
    return;
  }
  if (!startTransition(update)) update();
}
