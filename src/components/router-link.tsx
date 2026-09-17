"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface RouterLinkProps extends React.ComponentProps<typeof Link> {
  children: React.ReactNode;
  className?: string;
}

/**
 * RouterLink - CTA underline draws itself like a router path
 * 
 * Carpentry personality: The underline animates as though it were being routed.
 * Subtle drawing animation that adds premium feel without being distracting.
 */
export function RouterLink({ children, className, href, ...props }: RouterLinkProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (linkRef.current) {
      observer.observe(linkRef.current);
    }

    return () => {
      if (linkRef.current) {
        observer.unobserve(linkRef.current);
      }
    };
  }, []);

  return (
    <Link
      ref={linkRef}
      href={href}
      className={cn(
        "relative inline-flex items-center gap-1 font-semibold text-primary hover:text-honey transition-colors duration-200",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
      <span className="relative inline-block">
        →
        {/* Router path underline */}
        <span
          className={cn(
            "absolute left-0 bottom-0 w-full h-0.5 bg-honey origin-left transition-all duration-500 ease-out",
            isVisible ? "scale-x-100" : "scale-x-0",
            isHovered ? "scale-x-100" : ""
          )}
          style={{
            transitionDelay: isVisible ? "200ms" : "0ms"
          }}
        />
      </span>
    </Link>
  );
}
