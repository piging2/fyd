"use client";

import { useEffect, useRef } from "react";
import { useMotion } from "@/components/motion-provider";

interface WorkshopAtmosphereProps {
  className?: string;
  particleCount?: number;
}

/**
 * WorkshopAtmosphere — subtle decorative background for dark cards
 * 
 * Creates a premium workshop atmosphere with extremely low opacity,
 * slow movement, and no distraction. Designed to enhance dark surfaces
 * without competing with content.
 * 
 * Effect: subtle workshop atmosphere, drifting sawdust, craftsmanship
 * Not: stars, confetti, sparkles, fireworks, galaxy
 * 
 * Respects prefers-reduced-motion: disables animation when enabled.
 */
export function WorkshopAtmosphere({ 
  className,
  particleCount = 20 
}: WorkshopAtmosphereProps) {
  const { prefersReducedMotion } = useMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Don't animate if user prefers reduced motion
    if (prefersReducedMotion) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }> = [];

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        initParticles();
      }
    };

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.2, // Very slow horizontal movement
          vy: (Math.random() - 0.5) * 0.15, // Very slow vertical movement
          size: Math.random() * 2 + 0.5, // Small particles
          opacity: Math.random() * 0.08 + 0.02, // Extremely low opacity (2-10%)
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(particle => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 154, 78, ${particle.opacity})`; // Honey color
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    resize();
    animate();

    const resizeObserver = new ResizeObserver(resize);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [particleCount, prefersReducedMotion]);

  // Return null if reduced motion is enabled
  if (prefersReducedMotion) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0.6,
      }}
      aria-hidden="true"
    />
  );
}
