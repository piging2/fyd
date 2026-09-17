/**
 * Motion Tokens
 * 
 * Global animation configuration tokens.
 * Centralized values for consistent motion across the site.
 * No hardcoded animation values should exist outside this file.
 */

/**
 * Duration Tokens
 * Standardized animation durations in milliseconds
 */
export const duration = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  slower: 0.7,
  slowest: 1.0,
  hero: 0.8,
  page: 0.4,
  stagger: 0.1,
  staggerFast: 0.05,
  staggerSlow: 0.15,
} as const;

/**
 * Delay Tokens
 * Standardized animation delays in milliseconds
 */
export const delay = {
  none: 0,
  instant: 0.05,
  fast: 0.1,
  normal: 0.2,
  slow: 0.3,
  slower: 0.5,
  hero: 0.3,
  stagger: 0.1,
} as const;

/**
 * Spring Tokens
 * Standardized spring physics for natural motion
 */
export const spring = {
  gentle: {
    stiffness: 300,
    damping: 25,
  },
  bouncy: {
    stiffness: 400,
    damping: 20,
  },
  snappy: {
    stiffness: 500,
    damping: 30,
  },
  smooth: {
    stiffness: 200,
    damping: 20,
  },
  magnetic: {
    stiffness: 300,
    damping: 20,
  },
  magneticStrong: {
    stiffness: 400,
    damping: 25,
  },
  magneticSubtle: {
    stiffness: 200,
    damping: 15,
  },
} as const;

/**
 * Easing Tokens
 * Standardized easing functions
 */
export const easing = {
  linear: [0, 0, 1, 1] as const,
  easeIn: [0.42, 0, 1, 1] as const,
  easeOut: [0, 0, 0.58, 1] as const,
  easeInOut: [0.42, 0, 0.58, 1] as const,
  premium: [0.22, 1, 0.36, 1] as const, // Custom premium easing
  smooth: [0.25, 0.1, 0.25, 1] as const,
  sharp: [0.4, 0, 0.2, 1] as const,
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
} as const;

/**
 * Opacity Tokens
 * Standardized opacity values for fade animations
 */
export const opacity = {
  hidden: 0,
  visible: 1,
  subtle: 0.8,
  muted: 0.6,
  faint: 0.4,
  ghost: 0.2,
} as const;

/**
 * Distance Tokens
 * Standardized distance values for translate animations
 */
export const distance = {
  none: 0,
  tiny: 5,
  small: 10,
  normal: 20,
  medium: 30,
  large: 40,
  larger: 50,
  huge: 100,
} as const;

/**
 * Scale Tokens
 * Standardized scale values
 */
export const scale = {
  none: 1,
  shrink: 0.95,
  shrinkMore: 0.9,
  grow: 1.05,
  growMore: 1.1,
  growMost: 1.15,
} as const;

/**
 * Blur Tokens
 * Standardized blur values for blur animations
 */
export const blur = {
  none: 0,
  subtle: 4,
  normal: 8,
  medium: 12,
  strong: 16,
  heavy: 24,
} as const;

/**
 * Parallax Tokens
 * Standardized parallax multipliers
 */
export const parallax = {
  none: 0,
  subtle: 0.1,
  normal: 0.2,
  medium: 0.3,
  strong: 0.5,
  hero: 0.3,
  background: 0.15,
} as const;

/**
 * Reduced Motion Tokens
 * Configuration for users who prefer reduced motion
 */
export const reducedMotion = {
  duration: 0.001,
  delay: 0,
  spring: {
    stiffness: 0,
    damping: 0,
  },
  parallax: 0,
  scale: 1,
  blur: 0,
} as const;

/**
 * Viewport Tokens
 * Standardized viewport detection settings
 */
export const viewport = {
  once: true,
  amount: 0.1, // 10% of element must be visible
  margin: "-50px", // Trigger 50px before element enters viewport
} as const;

/**
 * Animation Presets
 * Common animation combinations
 */
export const preset = {
  fade: {
    duration: duration.normal,
    ease: easing.easeOut,
  },
  reveal: {
    duration: duration.slower,
    ease: easing.premium,
  },
  hover: {
    duration: duration.normal,
    ease: easing.premium,
  },
  tap: {
    duration: duration.fast,
    ease: easing.easeOut,
  },
  stagger: {
    staggerChildren: duration.stagger,
    delayChildren: delay.normal,
  },
  hero: {
    duration: duration.hero,
    ease: easing.premium,
  },
} as const;

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation values respecting reduced motion preference
 */
export function getMotionValues<T extends Record<string, any>>(
  normal: T,
  reduced: Partial<T>
): T {
  return prefersReducedMotion() ? { ...normal, ...reduced } : normal;
}
