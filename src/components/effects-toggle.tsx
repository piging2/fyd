"use client";

import * as React from "react";
import { Sparkles, Sparkle, ZapOff, MonitorSmartphone } from "lucide-react";
import {
  useVisualEffects,
  type EffectsPreference,
} from "@/components/effects-provider";
import { cn } from "@/lib/utils";

const ORDER: EffectsPreference[] = ["full", "reduced", "off", "system"];

const META: Record<
  EffectsPreference,
  { icon: typeof Sparkles; label: string; title: string }
> = {
  full: {
    icon: Sparkles,
    label: "Visual effects: full",
    title: "Visual effects: full, switch to reduced",
  },
  reduced: {
    icon: Sparkle,
    label: "Visual effects: reduced",
    title: "Visual effects: reduced, switch to off",
  },
  off: {
    icon: ZapOff,
    label: "Visual effects: off",
    title: "Visual effects: off, switch to system",
  },
  system: {
    icon: MonitorSmartphone,
    label: "Visual effects: system",
    title: "Visual effects: system, switch to full",
  },
};

/**
 * EffectsToggle: cycles full, reduced, off, system.
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
          "h-9 w-9 rounded-md flex items-center justify-center text-text-muted",
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
        "h-9 w-9 rounded-md flex items-center justify-center text-text-muted transition-colors hover:bg-surface-muted",
        className
      )}
      aria-label={meta.label}
      title={meta.title}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
