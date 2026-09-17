/**
 * Magnetic Animations
 * 
 * Magnetic button effects that follow cursor slightly.
 * Creates premium, interactive feel for buttons and CTAs.
 */

import { Variants } from "framer-motion";

/**
 * Magnetic button effect (subtle cursor follow)
 */
export const magneticButton: Variants = {
  rest: { x: 0, y: 0 },
  hover: {
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 20
    }
  }
};

/**
 * Strong magnetic effect (for large CTAs)
 */
export const magneticStrong: Variants = {
  rest: { x: 0, y: 0, scale: 1 },
  hover: {
    scale: 1.05,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25
    }
  }
};

/**
 * Subtle magnetic effect (for small buttons)
 */
export const magneticSubtle: Variants = {
  rest: { x: 0, y: 0 },
  hover: {
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15
    }
  }
};
