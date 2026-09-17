import * as Lucide from "lucide-react";

// Valid icon names - generated from actual lucide-react usage in codebase
export const VALID_ICONS = [
  "Menu",
  "X",
  "MapPin",
  "Phone",
  "Mail",
  "Check",
  "ChevronLeft",
  "ChevronRight",
  "Upload",
  "Send",
  "Wrench",
  "Lightbulb",
  "Package",
  "CheckCircle2",
  "Star",
  "Moon",
  "Sun",
  "Loader2",
  "Box", // fallback icon
] as const;

export type IconName = typeof VALID_ICONS[number];

export function isValidIcon(name: string): name is IconName {
  return VALID_ICONS.includes(name as IconName);
}
