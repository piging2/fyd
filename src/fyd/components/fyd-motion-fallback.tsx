"use client";

import { useEffect } from "react";

/**
 * FydMotionFallback: keeps scroll-enter motion working where the browser
 * cannot drive CSS `animation-timeline: view()`.
 *
 * ARCHITECTURE (2026-09-23, Nolan's invariant):
 * Base state is ALWAYS visible. Motion is enhancement only.
 * If CSS animation fails completely, every object remains readable and interactive.
 *
 * This component NEVER sets opacity:0 as a durable state. When the IO path
 * activates, it adds `.fyd-io-pending` ONLY to elements below the fold.
 * Elements in the viewport stay visible. IntersectionObserver reveals
 * below-fold elements as they scroll into view.
 */
export function FydMotionFallback() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Reduced motion: ensure everything is visible, no animations.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("fyd-reduced-motion");
      return;
    }

    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()");

    // Safety net for false-positive native support: if the browser claims
    // to support scroll timelines but in-viewport cards are still at
    // opacity 0 after 2s, force them visible.
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    if (supportsTimeline) {
      safetyTimer = setTimeout(() => {
        const stuck: Element[] = [];
        document
          .querySelectorAll<HTMLElement>("[data-motion='enter']")
          .forEach((el) => {
            const rect = el.getBoundingClientRect();
            const inViewport =
              rect.top < window.innerHeight && rect.bottom > 0;
            if (!inViewport) return;
            const opacity = getComputedStyle(el).opacity;
            if (opacity === "0") stuck.push(el);
          });
        if (stuck.length > 0) {
          stuck.forEach((el) => el.classList.add("fyd-force-visible"));
        }
      }, 2000);
    }

    // If native timelines are NOT supported, use IntersectionObserver.
    // Base is visible; we only hide below-fold elements, then reveal on scroll.
    if (!supportsTimeline) {
      document.documentElement.classList.add("fyd-io");

      const els = Array.from(
        document.querySelectorAll<HTMLElement>("[data-motion='enter']")
      );

      // Hide only below-fold elements. In-viewport elements stay visible.
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inViewport) {
          el.classList.add("fyd-io-pending");
        } else {
          el.classList.add("fyd-inview");
        }
      });

      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              el.classList.remove("fyd-io-pending");
              el.classList.add("fyd-inview");
              io.unobserve(el);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
      );

      els.forEach((el) => {
        if (el.classList.contains("fyd-io-pending")) io.observe(el);
      });

      return () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        io.disconnect();
        document.documentElement.classList.remove("fyd-io");
      };
    }

    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, []);

  return null;
}
