/**
 * Reveal Animations
 * 
 * Scroll-triggered reveal animations for content sections.
 * Uses Framer Motion's useInView hook for viewport detection.
 * Respects reduced motion preferences - uses immediate opacity changes instead.
 */

import { Variants } from "framer-motion";

/**
 * Reveal from bottom (most common)
 * Under reduced motion: immediate opacity change, no movement
 * P0 FIX: Content must be visible immediately for progressive enhancement
 * Hidden state now has opacity: 1 to prevent rendering gate when client-side animation fails
 */
export const revealUp: Variants = {
  hidden: {
    opacity: 1,
    y: 30
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Reveal from top
 * Under reduced motion: immediate opacity change, no movement
 * P0 FIX: Content must be visible immediately for progressive enhancement
 */
export const revealDown: Variants = {
  hidden: {
    opacity: 1,
    y: -30
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Reveal from left
 * Under reduced motion: immediate opacity change, no movement
 * P0 FIX: Content must be visible immediately for progressive enhancement
 */
export const revealLeft: Variants = {
  hidden: {
    opacity: 1,
    x: 30
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    x: 0,
    transition: { duration: 0 }
  }
};

/**
 * Reveal from right
 * Under reduced motion: immediate opacity change, no movement
 * P0 FIX: Content must be visible immediately for progressive enhancement
 */
export const revealRight: Variants = {
  hidden: {
    opacity: 1,
    x: -30
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    x: 0,
    transition: { duration: 0 }
  }
};

/**
 * Reveal with scale (for cards, images)
 * Under reduced motion: immediate opacity change, no scale
 * P0 FIX: Content must be visible immediately for progressive enhancement
 */
export const revealScale: Variants = {
  hidden: {
    opacity: 1,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0 }
  }
};

/**
 * Reveal with blur (for text content)
 * Under reduced motion: immediate opacity change, no blur
 * P0 FIX: Content must be visible immediately for progressive enhancement
 */
export const revealBlur: Variants = {
  hidden: {
    opacity: 1,
    filter: "blur(10px)"
  },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0 }
  }
};
