/**
 * Action wiring verifier: the action analog of the binding verifier.
 *
 * UI-harvest law (extends verifyPresentationBinding): a screen counts as
 * WIRED only if a live check returns the data it renders. The same law
 * applies to actions and interactive components: a rendered action counts
 * as WIRED only if the backend capability that performs it is present and
 * reachable. Render only actions that work.
 *
 * - Known action + capability present + probe reachable -> WIRED.
 * - Known action + capability missing or probe failing -> UNWIRED.
 *   The component must then be absent or honestly state UNAVAILABLE,
 *   never silently zero and never a dead control.
 * - Unknown action -> never performable (fail closed).
 * - Partially working (local only, no persistence) -> DEGRADED with an
 *   honest reason the UI must surface next to the control.
 *
 * The verifier is pure: probes are injected by the caller (a server
 * component or a client mount probe), so this module never does I/O and
 * never touches the clock. Deterministic: same action + viewer +
 * probes -> same verdict.
 *
 * Probes (how each is obtained live is documented in PROBE_SOURCES):
 * - askEndpoint: POST /api/fyd/ask answers a question (200 + answer).
 * - persistEndpoint: the owner transition store accepts a transition.
 * - followCapable: ActivityPub follow is wired for this tenant/site.
 * - shareCapable: Web Share or clipboard is available in this browser.
 */

/** Minimal viewer shape: the capability list is the contract. */
export interface CapabilityViewer {
  capabilities: readonly string[];
}

/** The only question product components ask about the viewer. */
export function can(viewer: CapabilityViewer | null | undefined, capability: string): boolean {
  return !!viewer && viewer.capabilities.includes(capability);
}

/** Every interactive control on a generated node names one of these. */
export type NodeActionId =
  | "nav.switch_page"
  | "patch.propose"
  | "patch.apply_preview"
  | "patch.persist"
  | "ask.submit"
  | "contact.call"
  | "contact.email"
  | "contact.navigate"
  | "owner.correct_fact"
  | "owner.set_visibility"
  | "social.follow"
  | "social.share";

export type ActionStatus = "wired" | "degraded" | "unwired";

export interface ActionProbes {
  askEndpoint: boolean;
  persistEndpoint: boolean;
  followCapable: boolean;
  shareCapable: boolean;
}

export interface ActionWiring {
  action: NodeActionId;
  status: ActionStatus;
  /** False means: do not render this control, or render it as UNAVAILABLE. */
  performable: boolean;
  /** Honest, user-safe reason. Shown next to the control when not wired. */
  reason: string;
  /** ViewerContext capability required, or null for public actions. */
  requiresCapability: string | null;
}

export const PROBE_SOURCES: Record<keyof ActionProbes, string> = {
  askEndpoint: "POST /api/fyd/ask with a question returns 200 and an answer envelope.",
  persistEndpoint: "The owner transition store accepts and returns a persisted transition.",
  followCapable: "ActivityPub follow is configured and authorized for this site tenant.",
  shareCapable: "navigator.share or clipboard write is available in this browser.",
};

const UNKNOWN_ACTION: ActionWiring = {
  action: "nav.switch_page",
  status: "unwired",
  performable: false,
  reason: "Unknown action. Nothing renders for it.",
  requiresCapability: null,
};

export function verifyAction(
  action: string,
  viewer: CapabilityViewer | null | undefined,
  probes: ActionProbes,
): ActionWiring {
  switch (action as NodeActionId) {
    case "nav.switch_page":
      return {
        action, status: "wired", performable: true,
        reason: "Local page switch. Always available.",
        requiresCapability: null,
      };
    case "patch.propose":
      return can(viewer, "site.propose")
        ? {
            action, status: "wired", performable: true,
            reason: "Proposal composer runs locally and validates before preview.",
            requiresCapability: "site.propose",
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Site proposals need the owner capability.",
            requiresCapability: "site.propose",
          };
    case "patch.apply_preview":
      return can(viewer, "site.approve")
        ? {
            action, status: "degraded", performable: true,
            reason: "Applies to this preview only. Persistence is not wired yet.",
            requiresCapability: "site.approve",
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Applying changes needs the owner capability.",
            requiresCapability: "site.approve",
          };
    case "patch.persist":
      if (!can(viewer, "site.approve")) {
        return {
          action, status: "unwired", performable: false,
          reason: "Persisting changes needs the owner capability.",
          requiresCapability: "site.approve",
        };
      }
      return probes.persistEndpoint
        ? {
            action, status: "wired", performable: true,
            reason: "Transition store reachable. Change will persist.",
            requiresCapability: "site.approve",
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Change persistence is not wired yet. Nothing is saved.",
            requiresCapability: "site.approve",
          };
    case "ask.submit":
      return probes.askEndpoint
        ? {
            action, status: "wired", performable: true,
            reason: "Ask FYD endpoint answered the probe.",
            requiresCapability: null,
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Ask FYD is unavailable on this node right now.",
            requiresCapability: null,
          };
    case "contact.call":
    case "contact.email":
    case "contact.navigate":
      // Performability is per-link: the renderer resolves each value through
      // the safe-link gate. A link that does not resolve safe never renders.
      return {
        action: action as NodeActionId, status: "wired", performable: true,
        reason: "Rendered only when the value resolves to a safe link.",
        requiresCapability: null,
      };
    case "owner.correct_fact":
    case "owner.set_visibility":
      return can(viewer, "field.visibility.change")
        ? {
            action: action as NodeActionId, status: "unwired", performable: false,
            reason: "The owner review surface is not mounted on this node yet.",
            requiresCapability: "field.visibility.change",
          }
        : {
            action: action as NodeActionId, status: "unwired", performable: false,
            reason: "Correcting or hiding facts needs the owner capability.",
            requiresCapability: "field.visibility.change",
          };
    case "social.follow":
      return probes.followCapable
        ? {
            action, status: "wired", performable: true,
            reason: "Follow is configured for this site.",
            requiresCapability: null,
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Following is not available for this site.",
            requiresCapability: null,
          };
    case "social.share":
      return probes.shareCapable
        ? {
            action, status: "degraded", performable: true,
            reason: "Shares through this browser. No FYD account needed.",
            requiresCapability: null,
          }
        : {
            action, status: "unwired", performable: false,
            reason: "Sharing is not available in this browser.",
            requiresCapability: null,
          };
    default:
      return { ...UNKNOWN_ACTION, reason: `Unknown action "${action}". Nothing renders for it.` };
  }
}

/** Full wiring table for the node surface. Used by the wired audit. */
export function wiringTable(
  viewer: CapabilityViewer | null | undefined,
  probes: ActionProbes,
): ActionWiring[] {
  const actions: NodeActionId[] = [
    "nav.switch_page",
    "patch.propose",
    "patch.apply_preview",
    "patch.persist",
    "ask.submit",
    "contact.call",
    "contact.email",
    "contact.navigate",
    "owner.correct_fact",
    "owner.set_visibility",
    "social.follow",
    "social.share",
  ];
  return actions.map((a) => verifyAction(a, viewer, probes));
}

/** Actions the UI may render as working controls right now. */
export function renderableActions(
  viewer: CapabilityViewer | null | undefined,
  probes: ActionProbes,
): ActionWiring[] {
  return wiringTable(viewer, probes).filter((w) => w.performable);
}
