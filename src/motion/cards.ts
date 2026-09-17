/**
 * Card Animations
 * 
 * Specialized animations for cards, service cards, and content cards.
 */

import { Variants } from "framer-motion";

/**
 * Card entrance animation
 */
export const cardEntrance: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.98
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

/**
 * Card hover effect (subtle lift)
 */
export const cardHover: Variants = {
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
 * Card tap effect (subtle press)
 */
export const cardTap: Variants = {
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
 * Service card stagger (for grid layouts)
 */
export const cardStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

export const cardStaggerItem: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};
