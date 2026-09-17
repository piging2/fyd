/**
 * Stagger Animations
 * 
 * Staggered animations for lists, grids, and sequential content.
 * Creates cascading reveal effects for multiple items.
 * Respects reduced motion preferences - uses immediate opacity changes.
 */

import { Variants } from "framer-motion";

/**
 * Stagger children with fade up
 * Under reduced motion: immediate opacity change, no stagger
 */
export const staggerUp: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

export const staggerUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5,
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
 * Stagger children with fade in
 * Under reduced motion: immediate opacity change, no stagger
 */
export const staggerFade: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

export const staggerFadeItem: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

/**
 * Stagger with scale (for cards)
 * Under reduced motion: immediate opacity change, no stagger
 */
export const staggerScale: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

export const staggerScaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.5,
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
 * Fast stagger for quick sequences
 * Under reduced motion: immediate opacity change, no stagger
 */
export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0
    }
  },
  reducedMotion: {
    opacity: 1,
    transition: { duration: 0 }
  }
};

export const staggerFastItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  },
  reducedMotion: {
    opacity: 1,
    y: 0,
    transition: { duration: 0 }
  }
};
