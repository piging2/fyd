"use client";

import { motion, Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { revealUp, revealDown, revealLeft, revealRight } from "@/motion";
import { useMotion } from "@/components/motion-provider";
import { useEffect } from 'react';

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

  useEffect(() => {
    console.log('[SCROLL-REVEAL_DIAGNOSTIC] COMPONENT_MOUNTED', {
      prefersReducedMotion,
      hasChildren: !!children,
      direction,
      delay,
      timestamp: performance.now(),
    });
  }, [prefersReducedMotion, direction, delay]);

  console.log('[SCROLL-REVEAL_DIAGNOSTIC] RENDER', {
    prefersReducedMotion,
    hasChildren: !!children,
    direction,
    delay,
    timestamp: performance.now(),
  });

  if (prefersReducedMotion) {
    console.log('[SCROLL-REVEAL_DIAGNOSTIC] REDUCED_MOTION - rendering plain div');
    // Render children immediately without animation
    return <div className={cn(className)}>{children}</div>;
  }

  console.log('[SCROLL-REVEAL_DIAGNOSTIC] MOTION_MODE - rendering motion.div with viewport detection');

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
      className={cn(className)}
      onAnimationStart={() => console.log('[SCROLL-REVEAL_DIAGNOSTIC] ANIMATION_START', { timestamp: performance.now() })}
      onAnimationComplete={() => console.log('[SCROLL-REVEAL_DIAGNOSTIC] ANIMATION_COMPLETE', { timestamp: performance.now() })}
    >
      {children}
    </motion.div>
  );
}
