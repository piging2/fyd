import * as React from "react";
import { cn } from "@/lib/utils";

/** Centered max-width content container. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** Vertical rhythm section. `size` controls breathing room:
    major = emotional moments (hero, featured, family); minor = supporting. */
export function Section({
  className,
  children,
  size = "major",
}: {
  className?: string;
  children: React.ReactNode;
  size?: "major" | "minor";
}) {
  const pad = size === "minor" ? "py-16 sm:py-20" : "py-24 sm:py-32";
  return <section className={cn(pad, className)}>{children}</section>;
}

/** A quiet section separator: thin cedar rule + tiny brass pin. Never obvious. */
export function CraftDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)} aria-hidden="true">
      <div className="craft-rule"><span /></div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  descriptionColor = "text-text-muted",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  descriptionColor?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent" style={{ letterSpacing: '0.12em' }}>{eyebrow}</p>}
      <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>{typeof title === 'string' ? title : title}</h2>
      {description && <p className={cn("mt-5 text-lg sm:text-xl", descriptionColor)} style={{ lineHeight: 'var(--leading-body)', letterSpacing: 'var(--tracking-body)' }}>{typeof description === 'string' ? description : description}</p>}
    </div>
  );
}
