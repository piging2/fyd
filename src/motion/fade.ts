/**
 * Fade Animations
 * 
 * Simple opacity-based transitions for various use cases.
 * Uses Framer Motion for consistent, performant animations.
 * Respects reduced motion preferences - uses immediate opacity changes.
 */

import { Variants } from "framer-motion";

/**
 * Fade in animation
 * Under reduced motion: immediate opacity change
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

/**
 * Fade out animation
 * Under reduced motion: immediate opacity change
 */
export const fadeOut: Variants = {
  visible: { opacity: 1 },
  hidden: { 
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  },
  reducedMotion: {
    opacity: 0,
    transition: { duration: 0 }
  }
};

/**
 * Fade in from specific direction
 * Under reduced motion: immediate opacity change, no movement
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    x: 0,
    transition: { duration: 0 }
  }
};

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  reducedMotion: {
    opacity: 1,
    x: 0,
    transition: { duration: 0 }
  }
};
