"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useMotion } from "@/components/motion-provider";

interface CardLightSweepProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * CardLightSweep — premium microinteraction for cards
 * 
 * Adds a subtle sweep of warm light as cards enter the viewport.
 * The effect feels like natural light passing across a surface.
 * 
 * Motion characteristics:
 * - GPU-accelerated transforms only
 * - Subtle, barely perceptible
 * - Respects prefers-reduced-motion
 * - Zero new RAF loops
 * - No global listeners
 * 
 * Color direction:
 * - Warm paper white light sweep (#F8F5F0)
 * - Very subtle opacity (15-20%)
 * - Diagonal movement for natural feel
 */
export function CardLightSweep({ children, className }: CardLightSweepProps) {
  const { prefersReducedMotion } = useMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={false}
    >
      {/* Warm light sweep overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10"
        initial={{ 
          background: 'linear-gradient(135deg, transparent 0%, transparent 50%, rgba(248, 245, 240, 0) 100%)',
          opacity: 0 
        }}
        whileInView={{ 
          background: 'linear-gradient(135deg, transparent 0%, rgba(248, 245, 240, 0.15) 50%, transparent 100%)',
          opacity: 1 
        }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ 
          duration: 0.8, 
          ease: [0.22, 1, 0.36, 1],
          delay: 0.1 
        }}
        style={{
          mixBlendMode: 'overlay',
        }}
      />
      {children}
    </motion.div>
  );
}
