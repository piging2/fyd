import * as React from "react";
import * as Lucide from "lucide-react";
import { cn } from "@/lib/utils";

/** Resolve a lucide-react icon by name from config. Falls back to a box. */
export function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Lucide.Box;
  return <Cmp className={cn("h-5 w-5", className)} aria-hidden="true" />;
}
