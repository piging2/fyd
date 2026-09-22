/**
 * Motion 3.0 semantic registry — harvest-only.
 *
 * Maps a semantic motion specification to a vetted deterministic
 * implementation harvested from the existing motion modules.
 *
 * Semantic axes (the only inputs):
 *   role          reveal | emphasis | feedback | ambient | transition
 *   placement     content | edge | overlay
 *   intensity     subtle | standard | strong
 *   trigger       scroll | hover | tap | mount | none
 *   reducedMotion boolean (prefers-reduced-motion state)
 *
 * Hard constraints enforced by the registry:
 * - CSS first for trivial motion (hover/tap feedback). Framer Motion only
 *   for scroll-triggered, spring, or orchestrated motion.
 * - Transform and opacity only. Implementations using filter, blur, or
 *   layout properties are NOT vetted and are excluded with reasons below.
 * - Reduced motion is always honored: reducedMotion=true resolves to no
 *   motion (instant state), regardless of the other axes.
 * - Decorative edge layers must be pointer-events-none and hidden below
 *   768px (no edge ornaments on small viewports).
 * - No GSAP, no Lottie. No customer-specific motion code: the registry is
 *   generic; generated surfaces resolve through it, never around it.
 * - Motion is presentation only. It never carries truth, evidence, or
 *   authority. A motion failure must never hide or fabricate content
 *   (progressive enhancement: content is visible without the animation).
 *
 * Determinism: resolveMotion is a pure function. The same spec always
 * resolves to the same implementation. No wall-clock, no randomness.
 */

import type { Variants } from "framer-motion";
import { revealUp, revealDown, revealLeft, revealRight } from "./reveal";
import { pageFade } from "./pageTransition";
import { duration } from "./motionTokens";

export type MotionRole = "reveal" | "emphasis" | "feedback" | "ambient" | "transition";
export type MotionPlacement = "content" | "edge" | "overlay";
export type MotionIntensity = "subtle" | "standard" | "strong";
export type MotionTrigger = "scroll" | "hover" | "tap" | "mount" | "none";

export interface MotionSpec {
  role: MotionRole;
  placement: MotionPlacement;
  intensity: MotionIntensity;
  trigger: MotionTrigger;
  reducedMotion: boolean;
}

export type MotionKind = "css" | "framer" | "none";

export interface MotionResolution {
  kind: MotionKind;
  /** Tailwind classes to apply (kind === "css"). Transform/opacity only. */
  cssClasses?: string;
  /** Framer Motion variants to spread onto a motion.* element (kind === "framer"). */
  variants?: Variants;
  /** Constraints the caller must satisfy for the resolution to be valid. */
  requirements: string[];
  /** Why this implementation was chosen. */
  reason: string;
}

/**
 * CSS-first trivial motion: hover/tap feedback on content.
 * transition-transform + scale/translate, opacity only. No JS needed.
 */
const CSS_FEEDBACK_SUBTLE = "transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]";
const CSS_FEEDBACK_STANDARD = "transition-all duration-200 ease-out hover:scale-[1.03] hover:opacity-90 active:scale-[0.97]";
const CSS_EMPHASIS_SUBTLE = "transition-transform duration-300 ease-out hover:-translate-y-0.5";
const CSS_EMPHASIS_STANDARD = "transition-transform duration-300 ease-out hover:-translate-y-1";

/**
 * Resolve a semantic motion spec to a vetted implementation.
 * Pure function: same spec -> same resolution, always.
 */
export function resolveMotion(spec: MotionSpec): MotionResolution {
  // Reduced motion wins over every other axis. No motion, instant state.
  if (spec.reducedMotion) {
    return {
      kind: "none",
      requirements: [],
      reason: "prefers-reduced-motion: motion resolved to instant state",
    };
  }

  // Decorative ambient layers live on the edge only, never touch content,
  // never intercept pointer events, and never render below 768px.
  // Harvests the existing .motion-ambient-drift CSS (transform-only keyframes,
  // gated by prefers-reduced-motion: no-preference in globals.css).
  if (spec.role === "ambient" && spec.placement === "edge") {
    return {
      kind: "css",
      cssClasses: "motion-ambient-drift pointer-events-none hidden md:block",
      requirements: [
        "pointer-events-none: decorative layer must not intercept input",
        "hidden md:block: no edge ornaments below 768px",
        ".motion-ambient-drift: transform/opacity keyframes only, reduced-motion gated",
      ],
      reason: "ambient edge decoration: harvested CSS drift, pointer-transparent, desktop-only",
    };
  }

  // Scroll-triggered reveals: Framer Motion, harvested variants.
  // All vetted variants are transform+opacity with reducedMotion states
  // and opacity:1 hidden states (progressive enhancement).
  if (spec.role === "reveal" && spec.trigger === "scroll") {
    const variants =
      spec.intensity === "strong"
        ? revealUp // strong reveal = standard rise; scale reserved for media
        : spec.placement === "overlay"
          ? revealDown
          : revealUp;
    return {
      kind: "framer",
      variants,
      requirements: [
        "use with whileInView + viewport once (see ScrollReveal)",
        "content must be visible if the animation never runs",
      ],
      reason: "scroll reveal: harvested revealUp/revealDown (transform+opacity, reduced-motion aware)",
    };
  }

  // Directional reveals (harvested; same guarantees as revealUp).
  if (spec.role === "reveal" && spec.trigger === "mount" && spec.placement === "content") {
    return {
      kind: "framer",
      variants: revealUp,
      requirements: ["content must be visible if the animation never runs"],
      reason: "mount reveal: harvested revealUp",
    };
  }

  // Trivial feedback: CSS first. No JS animation needed.
  if (spec.role === "feedback" && (spec.trigger === "hover" || spec.trigger === "tap")) {
    return {
      kind: "css",
      cssClasses: spec.intensity === "subtle" ? CSS_FEEDBACK_SUBTLE : CSS_FEEDBACK_STANDARD,
      requirements: ["transform/opacity only; no layout property transitions"],
      reason: "trivial feedback: CSS transition, transform+opacity only",
    };
  }

  // Emphasis on hover: CSS lift.
  if (spec.role === "emphasis" && spec.trigger === "hover") {
    return {
      kind: "css",
      cssClasses: spec.intensity === "subtle" ? CSS_EMPHASIS_SUBTLE : CSS_EMPHASIS_STANDARD,
      requirements: ["transform/opacity only"],
      reason: "hover emphasis: CSS translate, no JS",
    };
  }

  // Page/overlay transitions: harvested pageFade (opacity only).
  if (spec.role === "transition") {
    return {
      kind: "framer",
      variants: pageFade,
      requirements: ["opacity only; keep under 400ms"],
      reason: "transition: harvested pageFade (opacity only, reduced-motion aware)",
    };
  }

  // Closed world: anything not mapped above has no vetted implementation.
  // Callers must not invent motion for unmapped specs.
  return {
    kind: "none",
    requirements: [],
    reason: `no vetted implementation for ${spec.role}/${spec.placement}/${spec.intensity}/${spec.trigger}; motion omitted rather than invented`,
  };
}

/**
 * Vetting ledger. Every implementation the registry can return, and every
 * candidate that was excluded, with reasons. Harvest-only: nothing here was
 * invented for the registry; exclusions are documented, not silently dropped.
 */
export const VETTING_LEDGER = {
  vetted: [
    { impl: "revealUp/revealDown/revealLeft/revealRight", from: "src/motion/reveal.ts", why: "transform+opacity, reducedMotion variant, opacity:1 hidden (progressive enhancement)" },
    { impl: "pageFade", from: "src/motion/pageTransition.ts", why: "opacity only, reducedMotion variant, durations under 400ms" },
    { impl: "fadeIn/fadeUp/fadeDown/fadeLeft/fadeRight", from: "src/motion/fade.ts", why: "opacity-only, reducedMotion variants, progressive enhancement. Vetted alternative to reveal for opacity-only fades." },
    { impl: "CSS feedback/emphasis classes", from: "registry (Tailwind primitives)", why: "trivial motion belongs in CSS; transform/opacity only, zero JS" },
    { impl: "CSS ambient drift (.motion-ambient-drift)", from: "src/app/globals.css (new, generic)", why: "transform-only keyframes, prefers-reduced-motion gated; decorative only, pointer-events-none + hidden md:block required" },
  ],
  excluded: [
    { impl: "revealBlur", from: "src/motion/reveal.ts", why: "uses filter: blur(); violates transform-and-opacity-only. Not returned by the registry." },
    { impl: "ctaSignature / buttonSecondaryHover", from: "src/motion/buttons.ts", why: "animate boxShadow / backgroundColor; no reducedMotion variant. Violates transform-and-opacity-only. Unused. Not returned." },
    { impl: "buttonHover / buttonTap", from: "src/motion/buttons.ts", why: "transform-only but no reducedMotion variant; superseded by registry CSS feedback path. Unused. Not returned." },
    { impl: "hoverBrighten / hoverShadow / hoverBackground", from: "src/motion/hover.ts", why: "animate filter: brightness() / boxShadow / backgroundColor; no reducedMotion variant. Violates transform-and-opacity-only. Unused. Not returned." },
    { impl: "hoverLift / hoverScale / hoverLiftScale", from: "src/motion/hover.ts", why: "transform-only but no reducedMotion variant; superseded by registry CSS emphasis path. Unused. Not returned." },
    { impl: "cardEntrance / cardHover / cardTap / cardStagger", from: "src/motion/cards.ts", why: "no reducedMotion variant; component-specific, superseded by generic registry paths. Unused. Not returned." },
    { impl: "heroTextReveal / heroCtaReveal / heroBackgroundDrift / heroStagger", from: "src/motion/hero.ts", why: "component-specific hero motion; has reducedMotion variants but unused and superseded by generic registry paths. Not returned." },
    { impl: "revealScale", from: "src/motion/reveal.ts", why: "unused; scale-on-reveal unvetted for content (reserved). Not returned by the registry." },
    { impl: "headingReveal/bodyReveal/charReveal", from: "src/motion/typography.ts", why: "no reducedMotion variant; opacity:0 hidden without progressive-enhancement fix. Unused. Not returned." },
    { impl: "parallaxSlow/Medium/Fast/Horizontal", from: "src/motion/parallax.ts", why: "infinite ambient motion; unused. Ambient needs are served by the CSS drift path with mobile gating." },
    { impl: "magneticButton/Strong/Subtle", from: "src/motion/magnetic.ts", why: "unused variants; live magnetic effect in button.tsx is a bespoke transform-only implementation. Not returned." },
    { impl: "staggerUp/staggerFade (+items)", from: "src/motion/stagger.ts", why: "unused; stagger orchestration unvetted. Not returned." },
    { impl: "pageSlideUp", from: "src/motion/pageTransition.ts", why: "unused; slide transitions unvetted for page changes. Not returned." },
  ],
} as const;

/** Re-export the token scale so callers stay on tokens, not magic numbers. */
export { duration };
export { revealUp, revealDown, revealLeft, revealRight };
