/**
 * Viewport capabilities provider (compose lane, mobile architecture).
 *
 * ONE SEMANTIC SITESPEC: composition inputs are SiteSpec + ObjectGraph +
 * ViewerContext + ViewportCapabilities. The server cannot know the
 * viewport, so SSR renders the compact (mobile-first) baseline and this
 * provider resolves the real capabilities after mount:
 *   - stamps data-viewport / data-pointer / data-hover on <html> for
 *     CSS-driven layout projection (same object, different projection),
 *   - exposes the capabilities through useViewport() for BEHAVIORAL
 *     choices (touch-first interactions, rails vs grids).
 *
 * The DOM is identical with or without JS: only the projection changes,
 * so there is no hydration mismatch. Framework-free: window/document
 * only, no Next.js server internals, so a future SPA/API boundary stays
 * viable.
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  ViewportCapabilities,
  ViewportWidthClass,
} from "../sitespec/types";

const ViewportContext = createContext<ViewportCapabilities | null>(null);

/** Null on the server and before the provider resolves: compact baseline. */
export function useViewport(): ViewportCapabilities | null {
  return useContext(ViewportContext);
}

/** Width classes: xs <480, sm 480-767, md 768-1023, lg 1024-1439, xl 1440+. */
export function widthClassFor(width: number): ViewportWidthClass {
  if (width < 480) return "xs";
  if (width < 768) return "sm";
  if (width < 1024) return "md";
  if (width < 1440) return "lg";
  return "xl";
}

function readSafeArea(): ViewportCapabilities["safeArea"] {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;visibility:hidden;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) " +
      "env(safe-area-inset-bottom) env(safe-area-inset-left);";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const out = {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
    probe.remove();
    return out;
  } catch {
    return zero;
  }
}

/**
 * Resolve the current viewport capabilities. Null on the server (no
 * window): callers render the compact baseline.
 */
export function resolveViewportCapabilities(): ViewportCapabilities | null {
  if (typeof window === "undefined") return null;
  const mq = (q: string) =>
    typeof window.matchMedia === "function" &&
    window.matchMedia(q).matches;
  return {
    widthClass: widthClassFor(window.innerWidth || 0),
    pointer: mq("(pointer: coarse)") ? "coarse" : "fine",
    hover: mq("(hover: hover)"),
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    safeArea: readSafeArea(),
  };
}

export function FydViewportProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<ViewportCapabilities | null>(null);
  useEffect(() => {
    const apply = () => {
      const c = resolveViewportCapabilities();
      setCaps(c);
      if (c) {
        const el = document.documentElement;
        el.dataset.viewport = c.widthClass;
        el.dataset.pointer = c.pointer;
        el.dataset.hover = c.hover ? "yes" : "no";
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return (
    <ViewportContext.Provider value={caps}>{children}</ViewportContext.Provider>
  );
}
