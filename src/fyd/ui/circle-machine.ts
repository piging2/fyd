/**
 * Pure state machine for the FYD Circle component (see ./fyd-circle.tsx).
 *
 * States: collapsed | peek | expanded | ask
 *
 * Event vocabulary:
 * - hover / unhover : pointer entered / left the circle. The component owns a
 *   250ms mouseleave grace timer and only dispatches "unhover" when it fires.
 * - focus           : focus entered the circle (cancels a pending blur).
 * - blur            : focus left the circle; starts a 150ms grace period by
 *   setting closePending instead of collapsing immediately.
 * - blurSettled     : the 150ms grace elapsed with no refocus; collapses.
 * - tap             : click / Enter / Space / touch activation.
 * - tapOutside      : document-level pointerdown outside the circle.
 * - key             : raw key; "Escape" collapses from any state, Enter/Space
 *   activate from collapsed/peek.
 * - askOpen         : enter the ask sub-view (only valid from expanded).
 * - askClose        : leave the ask sub-view back to expanded.
 * - evidenceToggle  : swap the facts/answer area for provenance (only valid
 *   in expanded/ask).
 *
 * The machine is synchronous and deterministic. Fail-closed: any event that
 * is invalid in the current state returns the identical state object, so a
 * caller can rely on reference equality to detect "no transition".
 */

export type CircleViewState = "collapsed" | "peek" | "expanded" | "ask";

export interface CircleMachineState {
  state: CircleViewState;
  /** True while the provenance view replaces the facts/answer area. */
  evidence: boolean;
  /** True while a blur grace period is in flight (not yet settled). */
  closePending: boolean;
}

export const INITIAL_CIRCLE_STATE: CircleMachineState = {
  state: "collapsed",
  evidence: false,
  closePending: false,
};

export type CircleEvent =
  | { type: "hover" }
  | { type: "unhover" }
  | { type: "focus" }
  | { type: "blur" }
  | { type: "blurSettled" }
  | { type: "tap" }
  | { type: "tapOutside" }
  | { type: "key"; key: string }
  | { type: "askOpen" }
  | { type: "askClose" }
  | { type: "evidenceToggle" };

export function isCircleOpen(s: CircleMachineState): boolean {
  return s.state === "expanded" || s.state === "ask";
}

function collapse(): CircleMachineState {
  return { state: "collapsed", evidence: false, closePending: false };
}

/** Re-entry cancels a pending close; otherwise the state is untouched. */
function clearPending(s: CircleMachineState): CircleMachineState {
  if (!s.closePending) return s;
  return { ...s, closePending: false };
}

export function circleReducer(
  s: CircleMachineState,
  e: CircleEvent
): CircleMachineState {
  switch (e.type) {
    case "hover":
    case "focus": {
      if (s.state === "collapsed") {
        return { state: "peek", evidence: false, closePending: false };
      }
      return clearPending(s);
    }

    case "unhover": {
      // Dispatched by the component after its 250ms mouseleave grace.
      if (s.state === "collapsed") return s;
      return collapse();
    }

    case "blur": {
      if (s.state === "collapsed") return s;
      if (s.closePending) return s;
      return { ...s, closePending: true };
    }

    case "blurSettled": {
      if (s.state === "collapsed" || !s.closePending) return s;
      return collapse();
    }

    case "tap": {
      if (s.state === "collapsed" || s.state === "peek") {
        return { state: "expanded", evidence: false, closePending: false };
      }
      // In expanded/ask the interior controls own their taps.
      return s;
    }

    case "tapOutside": {
      if (s.state === "collapsed") return s;
      return collapse();
    }

    case "key": {
      if (e.key === "Escape") {
        if (s.state === "collapsed") return s;
        return collapse();
      }
      if (e.key === "Enter" || e.key === " ") {
        if (s.state === "collapsed" || s.state === "peek") {
          return { state: "expanded", evidence: false, closePending: false };
        }
        return s;
      }
      return s; // any other key: no transition
    }

    case "askOpen": {
      if (s.state !== "expanded") return s; // fail closed
      return { state: "ask", evidence: false, closePending: false };
    }

    case "askClose": {
      if (s.state !== "ask") return s; // fail closed
      return { state: "expanded", evidence: false, closePending: false };
    }

    case "evidenceToggle": {
      if (s.state !== "expanded" && s.state !== "ask") return s; // fail closed
      return { ...s, evidence: !s.evidence };
    }

    default: {
      // Exhaustiveness guard: unknown events can never transition.
      const _exhaustive: never = e;
      return s;
    }
  }
}
