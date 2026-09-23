/**
 * IntersectionObserver fallback for FYD scroll entrances (compose lane).
 *
 * Native CSS `animation-timeline: view()` drives `[data-motion='enter']`
 * entrances where supported (see FydMotionStyles). This client component
 * arms the `.fyd-io` fallback path only when:
 *   - the viewer has not requested reduced motion, and
 *   - the browser does not support scroll-driven animation timelines.
 *
 * It never touches layout or scrolling: it only adds `fyd-io` to
 * <html> and `fyd-inview` to elements as they enter the viewport, then
 * unobserves them. Under reduced motion it renders nothing and changes
 * nothing.
 */
"use client";

import { useEffect } from "react";

export function FydMotionFallback() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()")
    ) {
      return; // native scroll timelines handle [data-motion='enter']
    }
    document.documentElement.classList.add("fyd-io");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("fyd-inview");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    document
      .querySelectorAll("[data-motion='enter']")
      .forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("fyd-io");
    };
  }, []);
  return null;
}
