"use client";

import * as React from "react";
import { Sparkles, Gauge, ZapOff, MonitorSmartphone } from "lucide-react";
import {
  useVisualEffects,
  type EffectsPreference,
} from "@/components/effects-provider";
import { cn } from "@/lib/utils";

const ORDER: EffectsPreference[] = ["full", "reduced", "off", "system"];

const META: Record<
  EffectsPreference,
  { icon: typeof Sparkles; label: string; title: string; short: string; tone: string }
> = {
  full: {
    icon: Sparkles,
    label: "Visual effects: full",
    title: "Visual effects: full, switch to reduced",
    short: "Full",
    tone: "border-honey/60 bg-honey/10 text-honey-text",
  },
  reduced: {
    icon: Gauge,
    label: "Visual effects: reduced",
    title: "Visual effects: reduced, switch to off",
    short: "Reduced",
    tone: "border-ping-violet/50 bg-ping-violet/10 text-ping-violet",
  },
  off: {
    icon: ZapOff,
    label: "Visual effects: off",
    title: "Visual effects: off, switch to system",
    short: "Off",
    tone: "border-dashed border-border text-text-subtle",
  },
  system: {
    icon: MonitorSmartphone,
    label: "Visual effects: system",
    title: "Visual effects: system, switch to full",
    short: "System",
    tone: "border-border bg-surface-muted/60 text-text",
  },
};

/**
 * EffectsToggle: cycles full, reduced, off, system. Each stop
 * carries its own icon, name, and color so the current effect is
 * identifiable at a glance (owner word 2026-11-21: the effects in
 * the panel were not distinct enough from each other).
 * Compact header control, modeled on ThemeToggle. Persists via
 * EffectsProvider. The system stop returns the visitor to following
 * the OS reduced-motion signal; without it, a visitor who ever touched
 * the control could never get back to system behavior in-page.
 */
export function EffectsToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useVisualEffects();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn(
          "h-9 rounded-full border border-border px-3 flex items-center gap-2 text-sm font-semibold text-text-muted",
          className
        )}
        aria-label="Visual effects"
      >
        <Sparkles className="h-4 w-4" />
      </button>
    );
  }

  const meta = META[preference];
  const Icon = meta.icon;
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className={cn(
        "h-9 rounded-full border px-3 flex items-center gap-2 text-sm font-semibold transition-colors",
        meta.tone,
        className
      )}
      aria-label={meta.label}
      title={meta.title}
    >
      <Icon className="h-4 w-4" />
      <span>{meta.short}</span>
    </button>
  );
}
