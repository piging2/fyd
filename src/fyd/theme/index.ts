/**
 * Lane 6: FYD theme extension, typography + spacing (visual grammar v1).
 *
 * One-writer note: this directory (src/fyd/theme/*) is owned by lane 6.
 * The extension interface below is ADDITIVE: it only adds optional
 * fields. It is defined here (not in src/fyd/sitespec/types.ts, which
 * lane 8 owns) as the merge target for integration: the coordinator
 * folds FYDTypeThemeExtension into FYDThemeTokens without renaming or
 * removing any existing token.
 */

import type { FYDThemeTokens } from "../sitespec/types";
import {
  emitTypeCssVariables,
  emitTypeRoleClasses,
  selectTypeVoice,
} from "./type-scale";
import type { TypeVoice, TypeVoiceSignals } from "./type-scale";
import { emitSpacingCssVariables } from "./spacing";

export * from "./type-scale";
export * from "./spacing";

/**
 * Additive theme-token extension (lane 6). Every field optional, so
 * specs written before this change validate and render unchanged.
 * Integration: merge into FYDThemeTokens (sitespec/types.ts, lane 8).
 */
export interface FYDTypeThemeExtension {
  /**
   * Generic type voice: editorial (serif, trades-premium) or
   * utilitarian (grotesque, emergency/utility framing). Resolved from
   * TypeVoiceSignals via selectTypeVoice when absent.
   */
  typeVoice?: TypeVoice;
  /**
   * Signals that select the type voice: graph-derived trade/content
   * signals plus optional owner intent. Never carries customer names.
   */
  typeVoiceSignals?: TypeVoiceSignals;
}

/** Resolve the effective voice for a theme: explicit typeVoice wins,
 * then signals, then the editorial default. Pure. */
export function resolveTypeVoice(
  theme: FYDThemeTokens & Partial<FYDTypeThemeExtension>,
): TypeVoice {
  if (theme.typeVoice) return theme.typeVoice;
  return selectTypeVoice(
    theme.typeVoiceSignals ?? {
      trade: "unknown",
      longForm: false,
      emergency: false,
    },
  );
}

/**
 * Emit the full lane-6 CSS variable block for a theme: type + spacing
 * custom properties plus the .fyd-type-* role classes. Pure function
 * of (theme, voice): identical inputs produce byte-identical output,
 * which the snapshot tests pin down.
 */
export function emitFydThemeCss(
  theme: FYDThemeTokens,
  voice: TypeVoice,
  selector: string = ":root",
): string {
  const vars = emitTypeCssVariables(theme, voice);
  const spacing = emitSpacingCssVariables(theme);
  const classes = emitTypeRoleClasses(voice);
  return (
    "/* lane-6 type + spacing tokens (deterministic, voice: " +
    voice +
    ") */\n" +
    selector +
    " {\n" +
    vars
      .split("\n")
      .map((l) => "  " + l)
      .join("\n") +
    "\n" +
    spacing
      .split("\n")
      .map((l) => "  " + l)
      .join("\n") +
    "\n}\n" +
    classes
  );
}

/**
 * Convenience: emit for a theme, resolving the voice from the theme
 * itself (explicit typeVoice, else typeVoiceSignals, else default).
 * Still pure: the voice is a pure function of the theme.
 */
export function emitFydThemeCssForTheme(
  theme: FYDThemeTokens & Partial<FYDTypeThemeExtension>,
): string {
  return emitFydThemeCss(theme, resolveTypeVoice(theme));
}
