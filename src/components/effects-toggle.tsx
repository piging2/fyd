"use client";

import * as React from "react";
import { Sparkles, Sparkle, ZapOff } from "lucide-react";
import {
  useVisualEffects,
  type ResolvedEffects,
} from "@/components/effects-provider";
import { cn } from "@/lib/utils";

const ORDER: ResolvedEffects[] = ["full", "reduced", "off"];

const META: Record<
  ResolvedEffects,
  { icon: typeof Sparkles; label: string; title: string }
> = {
  full: {
    icon: Sparkles,
    label: "Visual effects: full",
    title: "Visual effects: full — switch to reduced",
  },
  reduced: {
    icon: Sparkle,
    label: "Visual effects: reduced",
    title: "Visual effects: reduced — switch to off",
  },
  off: {
    icon: ZapOff,
    label: "Visual effects: off",
    title: "Visual effects: off — switch to full",
  },
};

/**
 * EffectsToggle — cycles full → reduced → off.
 * Compact header control, modeled on ThemeToggle. Persists via EffectsProvider.
 */
export function EffectsToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useVisualEffects();
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

  const meta = META[resolved];
  const Icon = meta.icon;
  const next = ORDER[(ORDER.indexOf(resolved) + 1) % ORDER.length];

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
