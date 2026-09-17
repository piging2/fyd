/**
 * Hero Animations
 * 
 * Specialized animations for hero sections.
 * Note: Hero visuals are frozen per Phase 10 - only motion, no visual changes.
 * Respects reduced motion preferences.
 */

import { Variants } from "framer-motion";

/**
 * Hero text reveal (headline, subheadline)
 * Under reduced motion: immediate opacity change, no movement
 */
export const heroTextReveal: Variants = {
  hidden: { 
    opacity: 0, 
    y: 40 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.8,
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
 * Hero CTA reveal (buttons)
 * Under reduced motion: immediate opacity change, no movement
 */
export const heroCtaReveal: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20 
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      delay: 0.3,
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
 * Hero background drift (subtle, very slow)
 * Note: This replaces the CSS heroDrift keyframe
 * Under reduced motion: static scale, no animation
 */
export const heroBackgroundDrift: Variants = {
  initial: { scale: 1.06, y: 0 },
  animate: { 
    scale: 1.12, 
    y: -25,
    transition: {
      duration: 18,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  reducedMotion: {
    scale: 1.06,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Hero stagger for sequential text elements
 * Under reduced motion: immediate opacity change, no stagger
 */
export const heroStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

export const heroStaggerItem: Variants = {
  hidden: { opacity: 0, y: 30 },
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
