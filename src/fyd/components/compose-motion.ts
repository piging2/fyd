/**
 * Compose-lane motion machinery for the FYD customer surface.
 *
 * MOTION STACK (binding, from harvest): native CSS + View Transitions
 * API. Framer Motion lives only in the margin object layer, never here.
 * Zero new dependencies. Transform + opacity only. Reduced motion
 * collapses decorative motion; no functionality depends on animation.
 *
 * Contract:
 * - SiteSpec chooses motion SEMANTICS (theme.motionTokens, set by the
 *   composing strategy/archetype, owner-overridable). The renderer owns
 *   the IMPLEMENTATION below.
 * - MotionTokens is the canonical grill-contract shape, defined in the
 *   design-token types (src/fyd/sitespec/types.ts, "CANONICAL MOTION
 *   PROFILE"). This module imports it from there: one definition, no
 *   local copy. (The compose lane checked at start: the canonical
 *   definition had already landed, so no reconciliation copy was made.)
 */

import type { FYDThemeTokens, MotionTokens } from "../sitespec/types";

export type { MotionTokens };

/**
 * Restrained defaults: the surface animates quietly unless a strategy
 * asks for more (or for none). NEVER hijacks scrolling.
 */
export const DEFAULT_MOTION_TOKENS: MotionTokens = {
  motionIntensity: "SUBTLE",
  entrance: "FADE_RISE",
  objectTransition: "MORPH",
  stagger: "TIGHT",
};

/** Resolve the effective motion semantics for a theme. Pure. */
export function motionTokensForTheme(theme: FYDThemeTokens): MotionTokens {
  return { ...DEFAULT_MOTION_TOKENS, ...(theme.motionTokens ?? {}) };
}

/**
 * Reduced-motion gate. Injectable matcher keeps this unit-testable;
 * defaults to the real matchMedia, absent on the server (SSR markup
 * renders motion-capable; the CSS double-gate collapses it at runtime).
 */
export function motionAllowed(
  matchMediaFn?: (query: string) => { matches: boolean },
): boolean {
  const mm =
    matchMediaFn ??
    (typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : undefined);
  if (!mm) return true;
  return !mm("(prefers-reduced-motion: reduce)").matches;
}

type VTDocument = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => { finished: Promise<void> };
};

/**
 * startViewTransition wrapper: runs the update inside
 * document.startViewTransition when the API exists AND the viewer has
 * not asked for reduced motion; otherwise runs the update directly.
 * Never throws, never leaves the update unrun, never depends on
 * animation for the update to happen.
 */
export function startViewTransition(
  update: () => void | Promise<void>,
): void {
  const runDirect = () => {
    void update();
  };
  if (typeof document === "undefined") {
    runDirect();
    return;
  }
  if (!motionAllowed()) {
    runDirect();
    return;
  }
  const doc = document as VTDocument;
  if (typeof doc.startViewTransition !== "function") {
    runDirect();
    return;
  }
  try {
    doc.startViewTransition(() => {
      void update();
    });
  } catch {
    runDirect();
  }
}

/** Deterministic id slug for view-transition names. */
function slugId(id: string): string {
  const s = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "object" : s;
}

/**
 * View-transition name for an object. Card -> detail morphs the same
 * object when both surfaces stamp this name on the object's identity
 * element. Deterministic from the stable object id.
 */
export function objectViewTransitionName(objectId: string): string {
  return `fyd-object-${slugId(objectId)}`;
}

/**
 * View-transition name for the business identity. Page -> page keeps the
 * business identity persistent when both pages stamp this name on the
 * hero identity element.
 */
export function businessViewTransitionName(ownerObjectId: string): string {
  return `fyd-business-${slugId(ownerObjectId)}`;
}

/** View-transition name for a section shell. */
export function sectionViewTransitionName(sectionId: string): string {
  return `fyd-section-${slugId(sectionId)}`;
}

/**
 * Stagger delay in ms for a motion index. Deterministic; 0 when the
 * tokens say NONE or the intensity is NONE.
 */
export function staggerDelayMs(index: number, tokens: MotionTokens): number {
  if (tokens.motionIntensity === "NONE" || tokens.stagger === "NONE") return 0;
  const step = tokens.stagger === "RELAXED" ? 90 : 45;
  return Math.max(0, index) * step;
}

/** Entrance duration in ms for the intensity. 0 collapses motion. */
export function entranceDurationMs(tokens: MotionTokens): number {
  switch (tokens.motionIntensity) {
    case "NONE":
      return 0;
    case "EXPRESSIVE":
      return 520;
    default:
      return 260;
  }
}

/**
 * SEMANTIC MOTION (mobile architecture, binding): animation serves named
 * intents, never decorative soup.
 *
 * Implemented intents:
 * - ENTER: scroll entrance (duration from the intensity).
 * - EXPAND: affordance preview pop (180ms ease-out).
 * - Object-identity continuity across card -> detail is the priority
 *   use: the same stable id keeps its view-transition name
 *   (objectViewTransitionName), so the object persists instead of
 *   disappearing. Reduced motion or CROSSFADE suppresses the morph.
 *
 * Recognized but unimplemented: EXIT, COLLAPSE, REORDER, CONFIRM,
 * RELATIONSHIP_CREATED, OBJECT_UPDATED. They return null until a surface
 * genuinely needs them: no animation without a semantic reason, and no
 * functionality may depend on animation.
 */
export type FydMotionIntent =
  | "ENTER"
  | "EXIT"
  | "EXPAND"
  | "COLLAPSE"
  | "REORDER"
  | "CONFIRM"
  | "RELATIONSHIP_CREATED"
  | "OBJECT_UPDATED";

export interface IntentMotion {
  durationMs: number;
  easing: string;
}

export function motionForIntent(
  intent: FydMotionIntent,
  tokens: MotionTokens,
): IntentMotion | null {
  if (tokens.motionIntensity === "NONE") return null;
  switch (intent) {
    case "ENTER":
      return {
        durationMs: entranceDurationMs(tokens),
        easing: "cubic-bezier(.2,.7,.2,1)",
      };
    case "EXPAND":
      return { durationMs: 180, easing: "ease-out" };
    default:
      return null;
  }
}
