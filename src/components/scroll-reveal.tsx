"use client";

import { motion, Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { revealUp, revealDown, revealLeft, revealRight } from "@/motion";
import { useMotion } from "@/components/motion-provider";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}

/**
 * ScrollReveal - Gentle fade/slide animation when element enters viewport
 *
 * Migrated to use Framer Motion for consistent, performant animations.
 * Uses motion system primitives instead of custom IntersectionObserver.
 *
 * Respects prefers-reduced-motion: elements are immediately visible when enabled.
 * Uses centralized MotionProvider for consistent reduced-motion detection.
 *
 * Default behavior: Fade up with slight translateY
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = "up"
}: ScrollRevealProps) {
  const { prefersReducedMotion } = useMotion();

  if (prefersReducedMotion) {
    // Render children immediately without animation
    return <div className={cn(className)}>{children}</div>;
  }

  const variants: Record<string, Variants> = {
    up: revealUp,
    down: revealDown,
    left: revealLeft,
    right: revealRight,
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={variants[direction]}
      transition={{ delay }}
      className={cn("min-w-0", className)}
    >
      {children}
    </motion.div>
  );
}
