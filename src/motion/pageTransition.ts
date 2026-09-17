/**
 * Page Transition Animations
 * 
 * Smooth transitions between pages using Framer Motion's AnimatePresence.
 * Creates seamless navigation experience.
 * Respects reduced motion preferences - uses immediate state changes.
 */

import { Variants } from "framer-motion";

/**
 * Fade transition between pages
 * Under reduced motion: immediate opacity change
 */
export const pageFade: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

/**
 * Slide up transition between pages
 * Under reduced motion: immediate opacity change, no movement
 */
export const pageSlideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Scale transition between pages
 * Under reduced motion: immediate opacity change, no scale
 */
export const pageScale: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  exit: { 
    opacity: 0, 
    scale: 1.02,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  },
  reducedMotion: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0 }
  }
};
