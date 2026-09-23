/**
 * ViewportCapabilities: what the rendering viewport can do.
 *
 * Mobile architecture (Nolan, additive directive): the renderer
 * composition inputs are SiteSpec + ObjectGraph + ViewerContext +
 * ViewportCapabilities. ONE semantic SiteSpec, never a
 * DesktopSiteSpec/MobileSiteSpec: mobile is another composition of the
 * same semantic objects, and this shape is how the PresentationSpec
 * seam adapts (compact density on small viewports, coarse-pointer
 * touch targets, no hover assumptions).
 *
 * The seam reads: Object + ViewerContext + SurfaceContext (which
 * carries these capabilities) + AvailableCapabilities + EvidenceSummary
 * -> PresentationSpec. AvailableCapabilities and EvidenceSummary ride
 * inside the object projection; this file owns the viewport half.
 */

import * as React from "react";

export type ViewportWidthClass = "xs" | "sm" | "md" | "lg" | "xl";
export type PointerKind = "coarse" | "fine" | "none";
export type HoverKind = "hover" | "none";
export type DeviceClass = "phone" | "tablet" | "desktop";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportCapabilities {
  /** CSS viewport width in px at measurement time. */
  viewportWidth: number;
  /** Named width class. Boundaries are deterministic (see widthClassFor). */
  widthClass: ViewportWidthClass;
  /** Primary pointer: coarse (touch), fine (mouse/trackpad), none. */
  pointer: PointerKind;
  /** Whether hover is available. NO feature may depend on hover existing. */
  hover: HoverKind;
  /** prefers-reduced-motion at measurement time. */
  reducedMotion: boolean;
  /** Explicit color scheme; never guessed from the host page. */
  colorScheme: "light" | "dark";
  /**
   * Safe-area insets in px. On the web these are 0 here: real insets
   * come from CSS env(safe-area-inset-*) at render time. The numeric
   * fields exist for native shells that inject measured values.
   */
  safeArea: SafeAreaInsets;
  /**
   * Heuristic device class from width + pointer. A layout hint, never
   * an identity claim: a narrow desktop window reports "phone".
   */
  deviceClass: DeviceClass;
}

/**
 * Pure: width -> class. 320 (small phones) lands in xs; 375/390/430 in
 * sm; 768 in md; 1280 in lg; 1440+ in xl.
 */
export function widthClassFor(width: number): ViewportWidthClass {
  if (width < 360) return "xs";
  if (width < 600) return "sm";
  if (width < 1024) return "md";
  if (width < 1440) return "lg";
  return "xl";
}

/**
 * Pure: width + pointer -> device class. Documented heuristic: narrow
 * desktop windows report "phone"; touch laptops with wide viewports
 * report "tablet".
 */
export function deviceClassFor(width: number, pointer: PointerKind): DeviceClass {
  if (width < 768) return "phone";
  if (width < 1280 || pointer === "coarse") return "tablet";
  return "desktop";
}

/**
 * Pure: assemble the capabilities from measured inputs. The single
 * constructor every caller uses, so classification stays in one place
 * and tests can pin it.
 */
export function viewportCapabilitiesFor(input: {
  viewportWidth: number;
  pointer?: PointerKind;
  hover?: HoverKind;
  reducedMotion?: boolean;
  colorScheme?: "light" | "dark";
  safeArea?: SafeAreaInsets;
}): ViewportCapabilities {
  const pointer = input.pointer ?? "fine";
  return {
    viewportWidth: input.viewportWidth,
    widthClass: widthClassFor(input.viewportWidth),
    pointer,
    hover: input.hover ?? "hover",
    reducedMotion: input.reducedMotion ?? false,
    colorScheme: input.colorScheme ?? "light",
    safeArea: input.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 },
    deviceClass: deviceClassFor(input.viewportWidth, pointer),
  };
}

const hasWindow = typeof window !== "undefined";

function queryMatch(query: string): boolean {
  if (!hasWindow || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/**
 * Read the live viewport capabilities. matchMedia-based; safe during
 * SSR (returns desktop-ish defaults, no throw).
 */
export function readViewportCapabilities(
  colorScheme: "light" | "dark" = "light",
): ViewportCapabilities {
  if (!hasWindow) return viewportCapabilitiesFor({ viewportWidth: 1280 });
  const coarse = queryMatch("(pointer: coarse)");
  const fine = queryMatch("(pointer: fine)");
  return viewportCapabilitiesFor({
    viewportWidth: window.innerWidth,
    pointer: coarse ? "coarse" : fine ? "fine" : "none",
    hover: queryMatch("(hover: hover)") ? "hover" : "none",
    reducedMotion: queryMatch("(prefers-reduced-motion: reduce)"),
    colorScheme,
  });
}

/**
 * Hook: the live ViewportCapabilities, re-read on resize and on
 * media-query changes (pointer / hover / reduced-motion). Components
 * build their PresentationSpec from this; nothing reads
 * window.innerWidth directly anymore.
 */
export function useViewportCapabilities(
  colorScheme: "light" | "dark" = "light",
): ViewportCapabilities {
  const [caps, setCaps] = React.useState<ViewportCapabilities>(() =>
    readViewportCapabilities(colorScheme),
  );
  React.useEffect(() => {
    if (!hasWindow || typeof window.matchMedia !== "function") return;
    const queries = [
      "(pointer: coarse)",
      "(pointer: fine)",
      "(hover: hover)",
      "(prefers-reduced-motion: reduce)",
    ];
    const mqls = queries.map((q) => window.matchMedia(q));
    const refresh = () => setCaps(readViewportCapabilities(colorScheme));
    const onResize = () => refresh();
    window.addEventListener("resize", onResize);
    for (const m of mqls) m.addEventListener("change", refresh);
    return () => {
      window.removeEventListener("resize", onResize);
      for (const m of mqls) m.removeEventListener("change", refresh);
    };
  }, [colorScheme]);
  return caps;
}
