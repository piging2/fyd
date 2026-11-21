"use client";

import { useEffect, useState } from "react";
import { motion, type TargetAndTransition, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  delay as motionDelay,
  revealUp,
  revealDown,
  revealLeft,
  revealRight,
} from "@/motion";
import { useMotion } from "@/components/motion-provider";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  staggerIndex?: number;
  direction?: "up" | "down" | "left" | "right";
}

function useResponsiveGridColumns(enabled: boolean) {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (!enabled) return;

    const twoColumns = window.matchMedia("(min-width: 48rem)");
    const threeColumns = window.matchMedia("(min-width: 64rem)");
    const updateColumns = () => {
      setColumns(threeColumns.matches ? 3 : twoColumns.matches ? 2 : 1);
    };

    updateColumns();
    twoColumns.addEventListener("change", updateColumns);
    threeColumns.addEventListener("change", updateColumns);

    return () => {
      twoColumns.removeEventListener("change", updateColumns);
      threeColumns.removeEventListener("change", updateColumns);
    };
  }, [enabled]);

  return columns;
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
  staggerIndex,
  direction = "up"
}: ScrollRevealProps) {
  const { prefersReducedMotion } = useMotion();
  const columns = useResponsiveGridColumns(
    staggerIndex !== undefined && !prefersReducedMotion
  );
  const resolvedDelay =
    staggerIndex === undefined
      ? delay
      : (staggerIndex % columns) * motionDelay.stagger;

  if (prefersReducedMotion) {
    // Render children immediately without animation
    return <div className={cn("min-w-0", className)}>{children}</div>;
  }

  const variants: Record<string, Variants> = {
    up: revealUp,
    down: revealDown,
    left: revealLeft,
    right: revealRight,
  };

  const directionVariant = variants[direction];
  const visibleVariant = directionVariant.visible;
  const visibleTarget =
    typeof visibleVariant === "object" && visibleVariant !== null
      ? (visibleVariant as TargetAndTransition)
      : undefined;
  const variantsWithDelay: Variants = visibleTarget
    ? {
        ...directionVariant,
        visible: {
          ...visibleTarget,
          transition: {
            ...visibleTarget.transition,
            delay: resolvedDelay,
          },
        },
      }
    : directionVariant;
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={variantsWithDelay}
      className={cn("min-w-0", className)}
    >
      {children}
    </motion.div>
  );
}
