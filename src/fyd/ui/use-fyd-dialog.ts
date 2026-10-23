"use client";

/**
 * FYD SHELL INVARIANT (item 2): one dialog primitive for every FYD dialog.
 *
 * Native <dialog> stays the preferred element: showModal gives the platform
 * top layer, focus containment, and cancel (Escape) handling. The defect was
 * never the element; it was competing scroll ownership (Lenis vs body
 * overflow vs manual scrollTo) and unbalanced locks.
 *
 * This module owns, for every dialog that uses it:
 * - exactly one scroll owner while open: the Lenis modal lock (refcounted,
 *   balanced on EVERY exit path: close, cancel, unmount, error);
 * - the four focus proofs: trigger captured on open, background never moved
 *   by us, Escape closes, focus returns AND is visible;
 * - sticky-chrome registration while open (item 1).
 *
 * No new modal framework. The hook adapts: a <dialog> ref gets the native
 * path (top layer + platform cancel); a plain element (e.g. an animated
 * morph that cannot live in the top layer) gets the same coordination with
 * a manual Escape/Tab/focusin treatment.
 */

import * as React from "react";
import { useLenis } from "@/components/lenis-provider";
import { ensureFocusVisible, stickyChromeRegistry } from "./sticky-chrome";

export interface DialogControllerDeps {
  /** Balanced scroll-lock primitive (the Lenis setModalScrollLock). */
  setScrollLock: (locked: boolean) => void;
  /** Return focus to the trigger and make it visible. */
  returnFocus: (trigger: unknown) => void;
}

export interface DialogController {
  readonly depth: number;
  readonly closed: boolean;
  /** Open: capture the trigger, take the scroll lock. Nested opens stack. */
  open(trigger: unknown): void;
  /**
   * Request close (Escape, backdrop, programmatic): runs onClose exactly
   * once, then releases the lock and returns visible focus, even when
   * onClose throws (finally-structured).
   */
  requestClose(onClose: () => void): void;
  /** Unmount/error path: release the lock without calling onClose. */
  dispose(): void;
}

/**
 * Pure coordination core: no DOM, no React. Every balance/focus proof in
 * the regression suite runs against this unit.
 */
export function createDialogController(deps: DialogControllerDeps): DialogController {
  let depth = 0;
  let closed = false;
  let trigger: unknown = null;

  const releaseLock = () => {
    while (depth > 0) {
      depth -= 1;
      deps.setScrollLock(false);
    }
  };

  const returnFocus = () => {
    if (trigger !== null) {
      const t = trigger;
      trigger = null;
      deps.returnFocus(t);
    }
  };

  return {
    get depth() {
      return depth;
    },
    get closed() {
      return closed;
    },
    open(t: unknown) {
      // If the lock primitive throws, depth and trigger stay untouched, so
      // a later dispose() cannot unlock what was never locked.
      deps.setScrollLock(true);
      depth += 1;
      if (depth === 1) trigger = t;
    },
    requestClose(onClose: () => void) {
      if (closed) return;
      closed = true;
      try {
        onClose();
      } finally {
        releaseLock();
        returnFocus();
      }
    },
    dispose() {
      closed = true;
      releaseLock();
    },
  };
}

export type DialogFocusPolicy = "into" | "none";

export interface UseFydDialogOptions {
  open: boolean;
  onClose: () => void;
  /** Morph stage key (compact|full): focus moves in only on first present. */
  stage?: string;
  /**
   * "into" (default): the hook owns focus (capture trigger, move in, trap,
   * visible return) and the body overflow lock.
   * "none": a legacy dialog owns its own focus and markup; the hook only
   * balances the Lenis lock + chrome and makes the returned focus visible
   * on close, without touching the legacy internals.
   */
  focus?: DialogFocusPolicy;
  /**
   * Defer close teardown one animation frame so a legacy dialog's own
   * unmount cleanup (e.g. its scroll restore) runs first and cannot fight
   * the resumed scroller. Default false.
   */
  deferTeardown?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function firstFocusable(root: HTMLElement): HTMLElement | null {
  const preferred =
    root.querySelector<HTMLElement>("[data-autofocus]") ??
    root.querySelector<HTMLElement>("[data-object-close]") ??
    null;
  if (preferred) return preferred;
  const controls = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
  return controls[0] ?? null;
}

function trapTab(root: HTMLElement, event: KeyboardEvent): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (item) => item.getClientRects().length > 0,
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first) {
    event.preventDefault();
    root.focus();
  } else if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === root)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function useFydDialog(
  ref: React.RefObject<HTMLElement | null>,
  options: UseFydDialogOptions,
): void {
  const { open, stage, focus = "into", deferTeardown = false } = options;
  const { setModalScrollLock } = useLenis();
  const onCloseRef = React.useRef(options.onClose);
  onCloseRef.current = options.onClose;
  const lockRef = React.useRef(setModalScrollLock);
  lockRef.current = setModalScrollLock;
  const prevStageRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!open) return;
    const root = ref.current;

    const controller = createDialogController({
      setScrollLock: (locked: boolean) => lockRef.current(locked),
      returnFocus: (t: unknown) => {
        if (t instanceof HTMLElement) {
          // Visible return: plain focus(), then the item-1 safety net.
          // Never preventScroll:true here; that hides the returned focus.
          t.focus();
          ensureFocusVisible(t);
        }
      },
    });
    controller.open(typeof document !== "undefined" ? document.activeElement : null);

    // While open, the dialog covers the viewport: register as chrome so the
    // shell scroll-padding accounts for it (item 1).
    const chrome = stickyChromeRegistry();
    chrome.register({ id: "fyd-dialog-top", edge: "top", heightPx: 0 });
    chrome.register({ id: "fyd-dialog-bottom", edge: "bottom", heightPx: 0 });

    const el = ref.current;
    const isNative =
      typeof HTMLDialogElement !== "undefined" && el instanceof HTMLDialogElement;
    if (isNative && el.open === false) {
      el.showModal();
    }

    const cleanups: Array<() => void> = [];

    // Body overflow lock only when the hook owns the dialog. Legacy dialogs
    // (focus "none") keep their own overflow save/restore; the hook must not
    // nest inside it and corrupt the restore value.
    let previousOverflow = "";
    if (focus === "into" && typeof document !== "undefined") {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    // Focus moves in only when newly presenting; a stage morph keeps the
    // focus the user already placed inside the dialog.
    const stageChanged =
      stage !== undefined &&
      prevStageRef.current !== undefined &&
      prevStageRef.current !== stage;
    prevStageRef.current = stage;

    const requestClose = () => controller.requestClose(() => onCloseRef.current());

    if (focus === "into" && el && !isNative) {
      if (!stageChanged) {
        const target = firstFocusable(el) ?? el;
        target.focus({ preventScroll: true });
      }
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          requestClose();
          return;
        }
        if (event.key !== "Tab") return;
        trapTab(el, event);
      };
      const onFocusIn = (event: FocusEvent) => {
        if (!el.contains(event.target as Node)) {
          (firstFocusable(el) ?? el).focus();
        }
      };
      window.addEventListener("keydown", onKey);
      document.addEventListener("focusin", onFocusIn);
      cleanups.push(() => {
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("focusin", onFocusIn);
      });
    }

    if (isNative && el) {
      // Native path: never preventDefault the platform behavior. cancel and
      // close both funnel through the exactly-once requestClose.
      const onCancel = () => requestClose();
      const onNativeClose = () => requestClose();
      el.addEventListener("cancel", onCancel);
      el.addEventListener("close", onNativeClose);
      cleanups.push(() => {
        el.removeEventListener("cancel", onCancel);
        el.removeEventListener("close", onNativeClose);
      });
    }

    return () => {
      for (const fn of cleanups) fn();
      chrome.unregister("fyd-dialog-top");
      chrome.unregister("fyd-dialog-bottom");
      if (focus === "into" && typeof document !== "undefined") {
        // Restore only what we set; never clobber another owner's value.
        if (document.body.style.overflow === "hidden") {
          document.body.style.overflow = previousOverflow;
        }
      }
      const teardown = () => {
        // Balanced on every exit path: close, cancel, unmount, error.
        // The refcounted lock absorbs StrictMode remounts and rapid
        // close/reopen: each effect instance releases exactly what it took.
        controller.dispose();
        if (focus === "none" && typeof document !== "undefined") {
          // The legacy dialog restored focus its own way (possibly with
          // preventScroll:true); make the returned focus visible without
          // touching its internals.
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body) {
            ensureFocusVisible(active);
          }
        }
      };
      if (deferTeardown && typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(teardown);
      } else {
        teardown();
      }
    };
    // Only `open` retriggers. Stage, onClose identity, and focus policy are
    // read at open time via refs so a re-render never re-locks or steals
    // focus mid-morph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
