/**
 * Lane 6: FYD fluid type system. Visual grammar v1, type dimension.
 *
 * A deterministic, theme-driven type scale with real drama:
 * clamp() modular steps with rem floors (Utopia formula), a 16px body
 * floor that never shrinks, and four roles: display / body / meta /
 * button. Two font families max per site (display + body).
 *
 * The generic VOICE dimension (editorial serif vs utilitarian sans) is
 * selected from graph signals or owner intent, never from customer
 * identity. The signals interface deliberately has no name field; see
 * the invariant test in __tests__/type-scale.test.ts.
 *
 * Everything here is pure: token output is a pure function of
 * (theme, voice). The renderer/integration injects the emitted CSS;
 * this module never touches the DOM.
 *
 * Sources (design sprint 2026-09-26): findings/hpp-archaeology.md
 * (original H2 36/48px bold Playfair, leading 1.15, tracking -0.02em;
 * body Georgia serif 18px/1.6), findings/design-corpus.md P11 (fluid
 * clamp() modular scale, body floor fixed, text-wrap balance/pretty),
 * findings/github-corpus.md Utopia fluid-type item (slope-intercept
 * formula, rem floor on the preferred term).
 */

import type { FYDThemeTokens } from "../sitespec/types";

/** Viewport range the fluid scale interpolates across, in px. */
export const FLUID_MIN_VIEWPORT_PX = 320;
export const FLUID_MAX_VIEWPORT_PX = 1440;

/** Hard readability floor: body text never goes below 16px. */
export const BODY_FLOOR_REM = 1;

/** Generic type voice. Editorial = serif display/body (trades-premium);
 * utilitarian = grotesque display/body (emergency/utility framing).
 * Selected by graph signals or owner intent, NEVER by customer name. */
export type TypeVoice = "editorial" | "utilitarian";

/** The four typographic roles every FYD site uses. */
export type TypeRole = "display" | "body" | "meta" | "button";

/**
 * Graph/owner signals that select the type voice. Deliberately name-free:
 * there is no field here that can carry a customer or business name, so
 * no caller can select a voice "for" a named customer.
 */
export interface TypeVoiceSignals {
  /** Graph-derived trade category. */
  trade: "craft" | "utility" | "unknown";
  /** Graph-derived: long-form editorial content present. */
  longForm: boolean;
  /** Graph-derived: emergency/urgent service framing. */
  emergency: boolean;
  /** Owner-declared voice. Wins over graph signals when present. */
  ownerVoice?: TypeVoice;
}

/**
 * Select the type voice. Pure and deterministic: same signals in,
 * same voice out. Owner intent overrides graph signals. Emergency or
 * utility trades get the utilitarian voice; craft trades and long-form
 * content get editorial; unknown defaults to editorial (the serif
 * trades-premium register is the core market default).
 */
export function selectTypeVoice(signals: TypeVoiceSignals): TypeVoice {
  if (signals.ownerVoice) return signals.ownerVoice;
  if (signals.emergency || signals.trade === "utility") return "utilitarian";
  if (signals.trade === "craft" || signals.longForm) return "editorial";
  return "editorial";
}

/**
 * Utopia fluid-size helper: a single clamp() interpolating between
 * minRem at 320px and maxRem at 1440px. The middle preferred term
 * always carries a rem floor so browser zoom keeps working (pure vw
 * middle terms break 200% zoom). Deterministic: values rounded to
 * four decimals, trailing zeros stripped.
 */
export function fluid(
  minRem: number,
  maxRem: number,
  minVwPx: number = FLUID_MIN_VIEWPORT_PX,
  maxVwPx: number = FLUID_MAX_VIEWPORT_PX,
): string {
  const slope = (maxRem - minRem) / (maxVwPx - minVwPx);
  const intercept = minRem - minVwPx * slope;
  const fmt = (n: number): string => {
    const r = Math.round(n * 10000) / 10000;
    return String(r);
  };
  return (
    "clamp(" +
    fmt(minRem) +
    "rem, " +
    fmt(intercept) +
    "rem + " +
    fmt(slope * 100) +
    "vw, " +
    fmt(maxRem) +
    "rem)"
  );
}

/** One step of the fluid scale. */
export interface FluidTypeStep {
  /** Step key, also the CSS variable suffix: --fyd-type-<key>. */
  key: string;
  role: TypeRole;
  /** Fluid size as an emitted clamp() string (or fixed rem for floors). */
  size: string;
  /** Minimum rendered px at 320px viewport; used to enforce floors. */
  minPx: number;
  /** Unitless line height. */
  leading: number;
  /** Letter spacing. */
  tracking: string;
  /** Font weight. */
  weight: number;
  /** Family role: "display" uses --fyd-font-display, else --fyd-font-body. */
  family: "display" | "body";
  /** CSS text-wrap behavior. */
  wrap: "balance" | "pretty" | "none";
  /** Uppercase transform for eyebrow-style steps. */
  uppercase: boolean;
}

interface StepSpec {
  key: string;
  role: TypeRole;
  minPx: number;
  maxPx: number;
  leading: number;
  tracking: string;
  weight: number;
  family: "display" | "body";
  wrap: "balance" | "pretty" | "none";
  uppercase: boolean;
}

/** Voice family stacks. Editorial follows the HPP archaeology
 * (Playfair Display + Georgia book serif); utilitarian uses a
 * system grotesque stack. Two families max. */
export const VOICE_FAMILIES: Record<
  TypeVoice,
  { display: string; body: string }
> = {
  editorial: {
    display: '"Playfair Display", Georgia, serif',
    body: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
  },
  utilitarian: {
    display: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
};

/** Fluid step specs per voice. Editorial leans on the 1.333 perfect
 * fourth with serif drama; utilitarian compresses to a tighter 1.25
 * major third with a grotesque display. Floors (body/small/eyebrow/
 * button) are fixed in rem and shared by both voices. */
const VOICE_STEP_SPECS: Record<TypeVoice, StepSpec[]> = {
  editorial: [
    { key: "display-xl", role: "display", minPx: 48, maxPx: 88, leading: 1.05, tracking: "-0.02em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "display", role: "display", minPx: 36, maxPx: 72, leading: 1.15, tracking: "-0.02em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "h2", role: "display", minPx: 28, maxPx: 48, leading: 1.15, tracking: "-0.02em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "h3", role: "display", minPx: 20, maxPx: 24, leading: 1.25, tracking: "-0.01em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "lead", role: "body", minPx: 18, maxPx: 20, leading: 1.6, tracking: "0", weight: 400, family: "body", wrap: "pretty", uppercase: false },
  ],
  utilitarian: [
    { key: "display-xl", role: "display", minPx: 44, maxPx: 76, leading: 1.05, tracking: "-0.015em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "display", role: "display", minPx: 32, maxPx: 60, leading: 1.1, tracking: "-0.015em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "h2", role: "display", minPx: 26, maxPx: 40, leading: 1.15, tracking: "-0.01em", weight: 700, family: "display", wrap: "balance", uppercase: false },
    { key: "h3", role: "display", minPx: 18, maxPx: 22, leading: 1.25, tracking: "0", weight: 600, family: "display", wrap: "balance", uppercase: false },
    { key: "lead", role: "body", minPx: 18, maxPx: 20, leading: 1.55, tracking: "0", weight: 400, family: "body", wrap: "pretty", uppercase: false },
  ],
};

/** Fixed rem floors shared by both voices. Body is the hard 16px
 * floor: it never shrinks at any viewport. */
const FLOOR_SPECS: StepSpec[] = [
  { key: "body", role: "body", minPx: 16, maxPx: 16, leading: 1.6, tracking: "0.01em", weight: 400, family: "body", wrap: "pretty", uppercase: false },
  { key: "small", role: "meta", minPx: 14, maxPx: 14, leading: 1.5, tracking: "0.01em", weight: 400, family: "body", wrap: "pretty", uppercase: false },
  { key: "eyebrow", role: "meta", minPx: 14, maxPx: 14, leading: 1.4, tracking: "0.12em", weight: 600, family: "body", wrap: "none", uppercase: true },
  { key: "button", role: "button", minPx: 16, maxPx: 16, leading: 1.2, tracking: "0.01em", weight: 600, family: "body", wrap: "none", uppercase: false },
];

/**
 * Build the full fluid step list for a voice. Pure. Fixed floors are
 * emitted as rem (no clamp) so they can never shrink below their px.
 */
export function buildTypeSteps(voice: TypeVoice): FluidTypeStep[] {
  const fluidSteps = VOICE_STEP_SPECS[voice].map(
    (s): FluidTypeStep => ({
      key: s.key,
      role: s.role,
      size: fluid(s.minPx / 16, s.maxPx / 16),
      minPx: s.minPx,
      leading: s.leading,
      tracking: s.tracking,
      weight: s.weight,
      family: s.family,
      wrap: s.wrap,
      uppercase: s.uppercase,
    }),
  );
  const floors = FLOOR_SPECS.map(
    (s): FluidTypeStep => ({
      key: s.key,
      role: s.role,
      size: s.minPx / 16 + "rem",
      minPx: s.minPx,
      leading: s.leading,
      tracking: s.tracking,
      weight: s.weight,
      family: s.family,
      wrap: s.wrap,
      uppercase: s.uppercase,
    }),
  );
  return [...fluidSteps, ...floors];
}

/**
 * Emit the type CSS custom properties for a theme + voice. Pure
 * function of (theme, voice): identical inputs produce byte-identical
 * output. Theme font stacks override voice defaults when set; the
 * emitted variables keep the --fyd- prefix so they merge with the
 * existing token pipeline (renderer injects these inline; globals.css
 * carries the :root fallbacks).
 */
export function emitTypeCssVariables(
  theme: FYDThemeTokens,
  voice: TypeVoice,
): string {
  const families = VOICE_FAMILIES[voice];
  const displayFamily =
    theme.fontDisplay && theme.fontDisplay.trim().length > 0
      ? theme.fontDisplay
      : families.display;
  const bodyFamily =
    theme.fontBody && theme.fontBody.trim().length > 0
      ? theme.fontBody
      : families.body;
  const lines: string[] = [];
  lines.push("--fyd-font-display: " + displayFamily + ";");
  lines.push("--fyd-font-body: " + bodyFamily + ";");
  for (const step of buildTypeSteps(voice)) {
    const v = "--fyd-type-" + step.key;
    lines.push(v + ": " + step.size + ";");
    lines.push(v + "-leading: " + step.leading + ";");
    lines.push(v + "-tracking: " + step.tracking + ";");
    lines.push(v + "-weight: " + step.weight + ";");
  }
  lines.push("--fyd-measure: 65ch;");
  lines.push("--fyd-measure-narrow: 60ch;");
  return lines.join("\n");
}

/**
 * Role utility classes consumed by the renderer integration. Each
 * .fyd-type-<step> class applies size, leading, tracking, weight, and
 * the role family; headings balance their lines, prose wraps pretty.
 */
export function emitTypeRoleClasses(voice: TypeVoice): string {
  const rules: string[] = [];
  for (const step of buildTypeSteps(voice)) {
    const familyVar =
      step.family === "display" ? "var(--fyd-font-display)" : "var(--fyd-font-body)";
    rules.push(
      ".fyd-type-" +
        step.key +
        " { font-size: var(--fyd-type-" +
        step.key +
        "); line-height: var(--fyd-type-" +
        step.key +
        "-leading); letter-spacing: var(--fyd-type-" +
        step.key +
        "-tracking); font-weight: var(--fyd-type-" +
        step.key +
        "-weight); font-family: " +
        familyVar +
        ";" +
        (step.uppercase ? " text-transform: uppercase;" : "") +
        (step.wrap !== "none" ? " text-wrap: " + step.wrap + ";" : "") +
        " }",
    );
  }
  return rules.join("\n");
}
