"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface PencilLineProps {
  className?: string;
  direction?: "horizontal" | "vertical";
  color?: string;
}

/**
 * PencilLine - Animated pencil line drawing between sections
 * 
 * Carpentry personality: Line draws itself like a carpenter marking lumber.
 * Subtle drawing animation that adds visual interest without being distracting.
 * 
 * Default: Horizontal line, pencil gray color
 */
export function PencilLine({ 
  className, 
  direction = "horizontal",
  color = "rgba(100, 100, 100, 0.3)"
}: PencilLineProps) {
  const [isVisible, setIsVisible] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (lineRef.current) {
      observer.observe(lineRef.current);
    }

    return () => {
      if (lineRef.current) {
        observer.unobserve(lineRef.current);
      }
    };
  }, []);

  if (direction === "horizontal") {
    return (
      <div ref={lineRef} className={cn("w-full overflow-hidden", className)} aria-hidden="true">
        <div
          className="h-px transition-all duration-1000 ease-out"
          style={{
            backgroundColor: color,
            width: isVisible ? "100%" : "0%",
            transformOrigin: "left"
          }}
        />
      </div>
    );
  }

  return (
    <div ref={lineRef} className={cn("h-full overflow-hidden", className)} aria-hidden="true">
      <div
        className="w-px transition-all duration-1000 ease-out"
        style={{
          backgroundColor: color,
          height: isVisible ? "100%" : "0%",
          transformOrigin: "top"
        }}
      />
    </div>
  );
}
