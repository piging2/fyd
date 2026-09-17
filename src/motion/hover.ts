/**
 * Hover Animations
 * 
 * Interactive hover effects for buttons, cards, and interactive elements.
 * Uses Framer Motion's whileHover for smooth, performant interactions.
 */

import { Variants } from "framer-motion";

/**
 * Subtle lift on hover (for cards)
 */
export const hoverLift: Variants = {
  rest: { y: 0 },
  hover: { 
    y: -4,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Scale on hover (for buttons, icons)
 */
export const hoverScale: Variants = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Brighten on hover (for images)
 */
export const hoverBrighten: Variants = {
  rest: { filter: "brightness(1)" },
  hover: { 
    filter: "brightness(1.1)",
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
};

/**
 * Shadow increase on hover (for cards)
 */
export const hoverShadow: Variants = {
  rest: { 
    boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)"
  },
  hover: { 
    boxShadow: "0 4px 6px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,248,225,0.3)",
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  }
};

/**
 * Combined hover effect (lift + scale)
 */
export const hoverLiftScale: Variants = {
  rest: { y: 0, scale: 1 },
  hover: { 
    y: -4,
    scale: 1.02,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Subtle background shift on hover
 */
export const hoverBackground: Variants = {
  rest: { backgroundColor: "var(--color-surface)" },
  hover: { 
    backgroundColor: "var(--color-surface-2)",
    transition: {
      duration: 0.2,
      ease: "easeOut"
    }
  }
};
