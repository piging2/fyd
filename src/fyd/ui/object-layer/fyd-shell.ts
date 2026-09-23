/**
 * FYD interaction shell: ONE grammar for every FYD surface.
 *
 * Course correction (Nolan, 2026-09-22, BINDING): the oval-expansion
 * geometry is dead. GLYPH -> PEEK -> WORKSPACE. Geometry follows
 * function. The peek is a rectangular popover, the workspace a
 * restrained sheet. This file is the single source of truth for the
 * neutral interaction shell shared by Circle, Peek, Workspace,
 * Contact, Evidence, and Owner surfaces: radius, spacing, typography,
 * elevation, focus, buttons, object identity, status.
 *
 * Rules (from the directive):
 * - Remove anything that does not communicate IDENTITY, STATE, ACTION,
 *   EVIDENCE. Every border, shadow, and accent below earns its place.
 * - NEUTRAL shell: do not copy any site's design. FYD identity survives
 *   as the glyph mark + restrained royal/gold accents, never whole
 *   themed surfaces.
 * - Scalar, directly usable values. Zero customer-specific anything.
 */

import { fyd } from "./fyd-tokens";
import { compileShell, DEFAULT_DESIGN_INTENT } from "./design-compiler";

/** FYD brand hues, harvested from fyd-tokens (the single hue source). */
export const SHELL_HUE = {
  royal: fyd.color.royal,
  gold: fyd.color.gold,
  ink: "#1A1729",
} as const;

/**
 * The default compiled shell: DEFAULT_DESIGN_INTENT run through the
 * deterministic design compiler (./design-compiler). The values below
 * are the compiled output, not hand-picked constants; changing the
 * intent recompiles them. Per-SiteSpec consumption (threading a
 * compiled shell from the active spec) is the next step after this
 * seam.
 */
export const shell = {
  ...compileShell(DEFAULT_DESIGN_INTENT),
  /** The single quiet border. One edge treatment across all surfaces. */
  border: "1px solid rgba(26,23,41,0.10)",
  surface: {
    light: "#FFFFFF",
    /** Warm paper fallback for peek on warm sites. */
    paper: "#FBFAF7",
    dark: "#17141F",
    ink: "#1A1729",
    inkSoft: "rgba(26,23,41,0.72)",
    inkFaint: "rgba(26,23,41,0.52)",
    inkOnDark: "#F4F1EA",
    inkSoftOnDark: "rgba(244,241,234,0.72)",
  },
  /** Visible keyboard focus: one ring, royal, everywhere. */
  focusRing: "0 0 0 3px rgba(124,92,214,0.35)",
};

export type ShellColorScheme = "light" | "dark";

/**
 * Pure: surface colors for a scheme. Light is the default; dark is an
 * explicit opt-in (SurfaceContext.colorScheme), never guessed from the
 * host.
 */
export function shellSurface(scheme: ShellColorScheme): {
  bg: string;
  ink: string;
  inkSoft: string;
  border: string;
} {
  if (scheme === "dark") {
    return {
      bg: shell.surface.dark,
      ink: shell.surface.inkOnDark,
      inkSoft: shell.surface.inkSoftOnDark,
      border: "1px solid rgba(244,241,234,0.14)",
    };
  }
  return {
    bg: shell.surface.light,
    ink: shell.surface.ink,
    inkSoft: shell.surface.inkSoft,
    border: shell.border,
  };
}
