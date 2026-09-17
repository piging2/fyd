"use client";

import { motion, useScroll, useTransform, useMotionValue } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useMotion } from "@/components/motion-provider";
import { useLenis } from "@/components/lenis-provider";
import { useEffect } from "react";

interface ParallaxImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  speed?: number;
  children?: React.ReactNode;
}

/**
 * ParallaxImage - Subtle parallax effect for hero images
 * 
 * Uses Lenis scroll value synchronized with Framer Motion to prevent
 * the "overshoot, catch-up" symptom caused by independent scroll systems.
 * 
 * Respects prefers-reduced-motion: disables parallax when enabled.
 * Uses centralized MotionProvider for consistent reduced-motion detection.
 * 
 * Default speed: 0.3 (30% of scroll speed)
 */
export function ParallaxImage({
  src,
  alt,
  fill = true,
  priority = false,
  sizes = "100vw",
  className,
  speed = 0.3,
  children,
}: ParallaxImageProps) {
  const { prefersReducedMotion } = useMotion();
  const { lenis } = useLenis();
  
  // Create a MotionValue for Lenis scroll
  const lenisScroll = useMotionValue(0);

  // Sync Lenis scroll value with Framer Motion
  useEffect(() => {
    if (!lenis) return;

    const updateScroll = () => {
      lenisScroll.set(lenis.scroll);
    };

    lenis.on('scroll', updateScroll);
    return () => {
      lenis.off('scroll', updateScroll);
    };
  }, [lenis]);

  // Use Lenis scroll value if available, otherwise fall back to native scroll
  const { scrollY } = useScroll();
  const scrollSource = lenis ? lenisScroll : scrollY;
  const y = useTransform(
    scrollSource,
    [0, 1000],
    [0, 100 * speed]
  );

  if (prefersReducedMotion) {
    // Render static image without parallax
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <Image
          src={src}
          alt={alt}
          fill={fill}
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
        {children}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <motion.div style={{ y }}>
        <Image
          src={src}
          alt={alt}
          fill={fill}
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
        {children}
      </motion.div>
    </div>
  );
}
