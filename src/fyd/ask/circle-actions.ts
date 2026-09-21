/**
 * Capability-gated action mapping for the Circle card.
 *
 * The Circle is the portable doorway into an FYD Node. Every rendered
 * action binds to a real capability from the plan: actions the plan does
 * not contain are hidden, never rendered dead. Unknown future kinds are
 * skipped (fail closed), so a planner change can never surface a button
 * that does nothing.
 */

import type { CapabilityPlan, PlannedAction } from "../../lib/ping/types";

export type CircleUiAction =
  | { kind: "follow" | "unfollow"; action: PlannedAction }
  | { kind: "open" | "open_site"; action: PlannedAction }
  | { kind: "ask"; action: PlannedAction; label: string }
  | { kind: "propose_site_patch"; action: PlannedAction; label: string }
  | { kind: "open_website"; action: PlannedAction };

/**
 * Map a capability plan to the Circle's action row. Pure function.
 * like/unlike/reply/reference never render on identity cards; they stay
 * available in the Ask panel's suggested actions where they belong.
 */
export function circleUiActions(plan: CapabilityPlan | null, askLabel: string): CircleUiAction[] {
  if (!plan) return [];
  const out: CircleUiAction[] = [];
  for (const action of plan.actions) {
    switch (action.kind) {
      case "follow":
      case "unfollow":
      case "open":
      case "open_site":
      case "open_website":
        out.push({ kind: action.kind, action });
        break;
      case "ask":
        out.push({ kind: "ask", action, label: askLabel });
        break;
      case "propose_site_patch":
        out.push({ kind: "propose_site_patch", action, label: "Propose site change" });
        break;
      default:
        break;
    }
  }
  return out;
}
