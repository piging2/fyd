"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function StarRating({ rating, className }: { rating: number; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to trigger animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4 transition-all duration-300 ease-out",
            i <= rating ? "fill-primary text-primary" : "fill-border text-text-subtle",
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
          style={{
            transitionDelay: isVisible ? `${i * 50}ms` : "0ms"
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
