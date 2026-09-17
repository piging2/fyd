"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface BlueprintGridProps {
  className?: string;
  gridSize?: number;
  lineColor?: string;
}

/**
 * BlueprintGrid - Subtle blueprint grid pattern that fades in
 * 
 * Carpentry personality: Blueprint-style grid fades in behind process sections.
 * Very subtle pattern that adds depth without being distracting.
 * 
 * Default: 20px grid, faint blue-gray lines
 */
export function BlueprintGrid({ 
  className, 
  gridSize = 20,
  lineColor = "rgba(100, 120, 140, 0.08)"
}: BlueprintGridProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  return (
    <div 
      ref={ref}
      className={cn("absolute inset-0 pointer-events-none", className)}
      aria-hidden="true"
      style={{
        backgroundImage: `
          linear-gradient(to right, ${lineColor} 1px, transparent 1px),
          linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 1s ease-out'
      }}
    />
  );
}
