/**
 * FYD SHELL INVARIANT (item 1): sticky-chrome registry.
 *
 * Focused controls must never disappear behind FYD-created sticky UI.
 * Sticky/fixed producers register their measured height here instead of
 * authoring pixel guesses in CSS; the registry drives the shell
 * scroll-padding rule, which the browser honors for fragment navigation,
 * keyboard-focus scroll-into-view, and programmatic scrollIntoView alike.
 *
 * Generic: any future site, header height, or fixed CTA bar inherits
 * correct focus visibility with zero per-site work, because the offset is
 * measured at runtime, not authored.
 */

export type ChromeEdge = "top" | "bottom";

export interface StickyChromeEntry {
  /** Stable producer id, e.g. "ve-mobile-actions". One entry per producer. */
  id: string;
  edge: ChromeEdge;
  /** Measured height in CSS px. */
  heightPx: number;
}

export interface ChromeSnapshot {
  top: number;
  bottom: number;
}

export type ChromeApplier = (snapshot: ChromeSnapshot) => void;

export interface StickyChromeRegistry {
  register(entry: StickyChromeEntry): void;
  unregister(id: string): void;
  snapshot(): ChromeSnapshot;
  size(): number;
}

function computeSnapshot(entries: Map<string, StickyChromeEntry>): ChromeSnapshot {
  let top = 0;
  let bottom = 0;
  for (const entry of entries.values()) {
    const h = Number.isFinite(entry.heightPx) ? Math.max(0, entry.heightPx) : 0;
    if (entry.edge === "top") top = Math.max(top, h);
    else bottom = Math.max(bottom, h);
  }
  return { top, bottom };
}

/**
 * Pure registry. Overlapping registrations take the max per edge, so two
 * bottom bars never double-count; unregistering restores the remainder.
 */
export function createStickyChromeRegistry(onChange?: ChromeApplier): StickyChromeRegistry {
  const entries = new Map<string, StickyChromeEntry>();
  const emit = () => {
    if (onChange) onChange(computeSnapshot(entries));
  };
  return {
    register(entry: StickyChromeEntry) {
      entries.set(entry.id, { id: entry.id, edge: entry.edge, heightPx: entry.heightPx });
      emit();
    },
    unregister(id: string) {
      if (entries.delete(id)) emit();
    },
    snapshot() {
      return computeSnapshot(entries);
    },
    size() {
      return entries.size;
    },
  };
}

export const CHROME_TOP_VAR = "--fyd-chrome-top";
export const CHROME_BOTTOM_VAR = "--fyd-chrome-bottom";

let defaultRegistry: StickyChromeRegistry | null = null;

/**
 * Shell singleton. Writes --fyd-chrome-top / --fyd-chrome-bottom on the
 * document element; the shell stylesheet maps them onto scroll-padding.
 * Safe to call during SSR (no document): the writes are skipped.
 */
export function stickyChromeRegistry(): StickyChromeRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createStickyChromeRegistry((s) => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.style.setProperty(CHROME_TOP_VAR, `${s.top}px`);
      root.style.setProperty(CHROME_BOTTOM_VAR, `${s.bottom}px`);
    });
  }
  return defaultRegistry;
}

/** Test seam: drop the shell singleton between tests. */
export function __resetStickyChromeRegistry(): void {
  defaultRegistry = null;
}

import { useCallback, useEffect, useRef } from "react";

let chromeIdCounter = 0;

/**
 * useStickyChrome: for sticky/fixed producers. Returns a ref callback for
 * the producer's root element; the height is measured (and re-measured on
 * resize via ResizeObserver) and registered. Unmount unregisters, so the
 * registration is balanced by construction.
 */
export function useStickyChrome(
  edge: ChromeEdge,
  id?: string,
): (el: HTMLElement | null) => void {
  const entryId = useRef<string>("");
  if (!entryId.current) {
    chromeIdCounter += 1;
    entryId.current = id ?? `fyd-chrome-${edge}-${chromeIdCounter}`;
  }
  const edgeRef = useRef<ChromeEdge>(edge);
  edgeRef.current = edge;
  const observerRef = useRef<ResizeObserver | null>(null);

  const disconnect = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  // Balanced unregister even if React drops the ref without a null call.
  useEffect(() => {
    const rid = entryId.current;
    return () => {
      disconnect();
      stickyChromeRegistry().unregister(rid);
    };
  }, [disconnect]);

  return useCallback(
    (el: HTMLElement | null) => {
      const registry = stickyChromeRegistry();
      const rid = entryId.current;
      disconnect();
      if (!el) {
        registry.unregister(rid);
        return;
      }
      const measureAndRegister = () => {
        const h = el.getBoundingClientRect().height;
        registry.register({
          id: rid,
          edge: edgeRef.current,
          heightPx: Number.isFinite(h) ? Math.max(0, h) : 0,
        });
      };
      measureAndRegister();
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(measureAndRegister);
        ro.observe(el);
        observerRef.current = ro;
      }
    },
    [disconnect],
  );
}

export interface MeasurableElement {
  getBoundingClientRect(): { top: number; bottom: number };
  scrollIntoView(options?: ScrollIntoViewOptions): void;
}

export interface FocusVisibilityOptions {
  chromeTop?: number;
  chromeBottom?: number;
  viewportHeight?: number;
}

/**
 * ensureFocusVisible: safety net for programmatic focus (dialog
 * focus-return, item 2). After any runtime-driven .focus(), if the element
 * intersects registered sticky chrome, nudge it with block:"nearest" (the
 * shell scroll-padding already applies). Returns true when a corrective
 * scroll was requested.
 */
export function ensureFocusVisible(
  el: MeasurableElement,
  opts: FocusVisibilityOptions = {},
): boolean {
  const snapshot = stickyChromeRegistry().snapshot();
  const chromeTop = opts.chromeTop ?? snapshot.top;
  const chromeBottom = opts.chromeBottom ?? snapshot.bottom;
  const viewportHeight =
    opts.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 0);
  const rect = el.getBoundingClientRect();
  const hiddenAbove = rect.top < chromeTop;
  const hiddenBelow = rect.bottom > viewportHeight - chromeBottom;
  if (hiddenAbove || hiddenBelow) {
    el.scrollIntoView({ block: "nearest" });
    return true;
  }
  return false;
}
