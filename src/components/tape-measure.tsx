"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TapeMeasureProps {
  isExtended: boolean;
  className?: string;
  length?: number; // 0-100 percentage
}

/**
 * TapeMeasure - Animated tape measure extending effect
 * 
 * Carpentry personality: Tape measure extends when entering estimate page.
 * Subtle animation that feels like a carpenter preparing to measure.
 * 
 * Default: Extends to 100% when isExtended is true
 */
export function TapeMeasure({ isExtended, className, length = 100 }: TapeMeasureProps) {
  const [currentLength, setCurrentLength] = useState(0);

  useEffect(() => {
    if (isExtended) {
      // Animate extension
      const duration = 800; // ms
      const steps = 60;
      const increment = length / steps;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        setCurrentLength(Math.min(step * increment, length));
        if (step >= steps) {
          clearInterval(timer);
        }
      }, duration / steps);

      return () => clearInterval(timer);
    } else {
      // Retract immediately
      setCurrentLength(0);
    }
  }, [isExtended, length]);

  return (
    <div className={cn("relative h-2 overflow-hidden bg-surface-muted rounded-full", className)} aria-hidden="true">
      {/* Tape body */}
      <div
        className="absolute left-0 top-0 h-full bg-gradient-to-r from-honey via-primary to-honey transition-all duration-75 ease-out"
        style={{ width: `${currentLength}%` }}
      >
        {/* Tape markings */}
        <div className="absolute inset-0 flex items-center">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-white/30"
              style={{ height: i % 5 === 0 ? '100%' : '50%' }}
            />
          ))}
        </div>
      </div>
      
      {/* End hook */}
      {currentLength > 0 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-accent rounded-full transition-all duration-75 ease-out"
          style={{ 
            left: `${currentLength}%`,
            width: '8px',
            height: '12px'
          }}
        />
      )}
    </div>
  );
}
