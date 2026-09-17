/**
 * Parallax Animations
 * 
 * Parallax effects for hero images and background elements.
 * Uses Framer Motion's useScroll and useTransform for smooth parallax.
 * Respects reduced motion preferences.
 */

import { Variants } from "framer-motion";

/**
 * Subtle parallax for hero backgrounds
 * Disabled under reduced motion - uses static scale instead
 */
export const parallaxSlow: Variants = {
  initial: { scale: 1.05, y: 0 },
  animate: { 
    scale: 1.12, 
    y: -20,
    transition: {
      duration: 18,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  reducedMotion: {
    scale: 1.05,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Medium parallax for featured images
 * Disabled under reduced motion - uses static scale instead
 */
export const parallaxMedium: Variants = {
  initial: { scale: 1.05, y: 0 },
  animate: { 
    scale: 1.1, 
    y: -15,
    transition: {
      duration: 12,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  reducedMotion: {
    scale: 1.05,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Fast parallax for decorative elements
 * Disabled under reduced motion - uses static scale instead
 */
export const parallaxFast: Variants = {
  initial: { scale: 1.05, y: 0 },
  animate: { 
    scale: 1.08, 
    y: -10,
    transition: {
      duration: 8,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  reducedMotion: {
    scale: 1.05,
    y: 0,
    transition: { duration: 0 }
  }
};

/**
 * Horizontal parallax (for horizontal scroll sections)
 * Disabled under reduced motion - uses static position instead
 */
export const parallaxHorizontal: Variants = {
  initial: { x: 0 },
  animate: { 
    x: -30,
    transition: {
      duration: 15,
      ease: "easeInOut",
      repeat: Infinity,
      repeatType: "reverse"
    }
  },
  reducedMotion: {
    x: 0,
    transition: { duration: 0 }
  }
};
