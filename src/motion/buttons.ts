/**
 * Button Animations
 * 
 * Specialized animations for buttons and CTAs.
 */

import { Variants } from "framer-motion";

/**
 * Button hover effect (subtle lift)
 */
export const buttonHover: Variants = {
  rest: { y: 0, scale: 1 },
  hover: { 
    y: -1,
    scale: 1.02,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Button tap effect (subtle press)
 */
export const buttonTap: Variants = {
  rest: { scale: 1 },
  tap: { 
    scale: 0.98,
    transition: {
      duration: 0.1,
      ease: "easeOut"
    }
  }
};

/**
 * CTA signature button (premium feel)
 */
export const ctaSignature: Variants = {
  rest: { 
    y: 0,
    boxShadow: "0 1px 6px -2px rgba(217, 154, 78, 0.25), 0 0.5px 2px -1px rgba(217, 154, 78, 0.15)"
  },
  hover: { 
    y: -1,
    boxShadow: "0 3px 12px -4px rgba(217, 154, 78, 0.35), 0 1.5px 4px -2px rgba(217, 154, 78, 0.25)",
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Secondary button hover
 */
export const buttonSecondaryHover: Variants = {
  rest: { backgroundColor: "var(--color-text-on-dark/10)" },
  hover: { 
    backgroundColor: "var(--color-text-on-dark/20)",
    transition: {
      duration: 0.2,
      ease: "easeOut"
    }
  }
};
