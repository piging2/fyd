/**
 * Thorough reducer tests for the FYD circle state machine.
 *
 * Covers every transition, every invalid event (fail closed: the identical
 * state object is returned), Escape from ask, tap-outside, and the
 * focus/blur timing edges (blur grace cancelled by refocus vs. settled).
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import { circleReducer, INITIAL_CIRCLE_STATE, isCircleOpen } from "../circle-machine";
import type { CircleEvent, CircleMachineState } from "../circle-machine";

function state(over: Partial<CircleMachineState> = {}): CircleMachineState {
  return { ...INITIAL_CIRCLE_STATE, ...over };
}

const collapsed = () => state({ state: "collapsed" });
const peek = () => state({ state: "peek" });
const expanded = () => state({ state: "expanded" });
const ask = () => state({ state: "ask" });

describe("initial state", () => {
  test("starts collapsed with no evidence and no pending close", () => {
    expect(INITIAL_CIRCLE_STATE).toEqual({
      state: "collapsed",
      evidence: false,
      closePending: false,
    });
  });

  test("isCircleOpen is true only for expanded/ask", () => {
    expect(isCircleOpen(collapsed())).toBe(false);
    expect(isCircleOpen(peek())).toBe(false);
    expect(isCircleOpen(expanded())).toBe(true);
    expect(isCircleOpen(ask())).toBe(true);
  });
});

describe("collapsed", () => {
  test("hover -> peek", () => {
    expect(circleReducer(collapsed(), { type: "hover" })).toEqual(peek());
  });

  test("focus -> peek", () => {
    expect(circleReducer(collapsed(), { type: "focus" })).toEqual(peek());
  });

  test("tap -> expanded", () => {
    expect(circleReducer(collapsed(), { type: "tap" })).toEqual(expanded());
  });

  test("key Enter / Space -> expanded", () => {
    expect(circleReducer(collapsed(), { type: "key", key: "Enter" })).toEqual(expanded());
    expect(circleReducer(collapsed(), { type: "key", key: " " })).toEqual(expanded());
  });
});

describe("peek", () => {
  test("tap -> expanded", () => {
    expect(circleReducer(peek(), { type: "tap" })).toEqual(expanded());
  });

  test("key Enter / Space -> expanded", () => {
    expect(circleReducer(peek(), { type: "key", key: "Enter" })).toEqual(expanded());
    expect(circleReducer(peek(), { type: "key", key: " " })).toEqual(expanded());
  });

  test("unhover -> collapsed", () => {
    expect(circleReducer(peek(), { type: "unhover" })).toEqual(collapsed());
  });

  test("Escape -> collapsed", () => {
    expect(circleReducer(peek(), { type: "key", key: "Escape" })).toEqual(collapsed());
  });

  test("tapOutside -> collapsed", () => {
    expect(circleReducer(peek(), { type: "tapOutside" })).toEqual(collapsed());
  });

  test("hover/focus while already peeking keep peek (same reference)", () => {
    const s = peek();
    expect(circleReducer(s, { type: "hover" })).toBe(s);
    expect(circleReducer(s, { type: "focus" })).toBe(s);
  });
});

describe("expanded", () => {
  test("askOpen -> ask with evidence reset", () => {
    const s = state({ state: "expanded", evidence: true });
    expect(circleReducer(s, { type: "askOpen" })).toEqual(ask());
  });

  test("evidenceToggle flips evidence", () => {
    const on = circleReducer(expanded(), { type: "evidenceToggle" });
    expect(on.evidence).toBe(true);
    expect(on.state).toBe("expanded");
    const off = circleReducer(on, { type: "evidenceToggle" });
    expect(off.evidence).toBe(false);
    expect(off.state).toBe("expanded");
  });

  test("Escape -> collapsed and resets evidence", () => {
    const s = state({ state: "expanded", evidence: true });
    expect(circleReducer(s, { type: "key", key: "Escape" })).toEqual(collapsed());
  });

  test("tapOutside / unhover -> collapsed", () => {
    expect(circleReducer(expanded(), { type: "tapOutside" })).toEqual(collapsed());
    expect(circleReducer(expanded(), { type: "unhover" })).toEqual(collapsed());
  });

  test("tap on the open circle changes nothing (interior owns taps)", () => {
    const s = expanded();
    expect(circleReducer(s, { type: "tap" })).toBe(s);
  });

  test("hover/focus re-entry clears a pending close", () => {
    const s = state({ state: "expanded", closePending: true });
    const cleared = circleReducer(s, { type: "hover" });
    expect(cleared.closePending).toBe(false);
    expect(cleared.state).toBe("expanded");
  });
});

describe("ask", () => {
  test("askClose -> expanded with evidence reset", () => {
    const s = state({ state: "ask", evidence: true });
    expect(circleReducer(s, { type: "askClose" })).toEqual(expanded());
  });

  test("Escape from ask -> collapsed", () => {
    const s = state({ state: "ask", evidence: true });
    expect(circleReducer(s, { type: "key", key: "Escape" })).toEqual(collapsed());
  });

  test("evidenceToggle flips evidence inside ask", () => {
    const on = circleReducer(ask(), { type: "evidenceToggle" });
    expect(on).toEqual(state({ state: "ask", evidence: true }));
    expect(circleReducer(on, { type: "evidenceToggle" })).toEqual(ask());
  });

  test("tapOutside / unhover / blur+settle -> collapsed", () => {
    expect(circleReducer(ask(), { type: "tapOutside" })).toEqual(collapsed());
    expect(circleReducer(ask(), { type: "unhover" })).toEqual(collapsed());
    const pending = circleReducer(ask(), { type: "blur" });
    expect(pending.closePending).toBe(true);
    expect(circleReducer(pending, { type: "blurSettled" })).toEqual(collapsed());
  });

  test("tap and Enter inside ask change nothing (input owns them)", () => {
    const s = ask();
    expect(circleReducer(s, { type: "tap" })).toBe(s);
    expect(circleReducer(s, { type: "key", key: "Enter" })).toBe(s);
  });
});

describe("focus/blur timing edges", () => {
  test("blur starts a grace period instead of collapsing", () => {
    const s = circleReducer(expanded(), { type: "blur" });
    expect(s).toEqual(state({ state: "expanded", closePending: true }));
  });

  test("blur then focus cancels the grace period (no collapse)", () => {
    const s = expanded();
    const pending = circleReducer(s, { type: "blur" });
    const refocused = circleReducer(pending, { type: "focus" });
    expect(refocused).toEqual(expanded());
    // and a late blurSettled after cancellation is a no-op
    expect(circleReducer(refocused, { type: "blurSettled" })).toBe(refocused);
  });

  test("blur then blurSettled collapses (grace elapsed)", () => {
    const pending = circleReducer(expanded(), { type: "blur" });
    expect(circleReducer(pending, { type: "blurSettled" })).toEqual(collapsed());
  });

  test("double blur does not stack (same reference on the second)", () => {
    const pending = circleReducer(expanded(), { type: "blur" });
    expect(circleReducer(pending, { type: "blur" })).toBe(pending);
  });

  test("blurSettled with no pending blur is a no-op", () => {
    const s = expanded();
    expect(circleReducer(s, { type: "blurSettled" })).toBe(s);
  });

  test("tap during the grace period expands and clears it", () => {
    const pending = circleReducer(peek(), { type: "blur" });
    expect(pending.closePending).toBe(true);
    expect(circleReducer(pending, { type: "tap" })).toEqual(expanded());
  });
});

describe("fail closed: invalid events return the identical state object", () => {
  const invalid: Array<[string, CircleMachineState, CircleEvent]> = [
    // collapsed: only hover/focus/tap/Enter/Space are valid
    ["collapsed + Escape", collapsed(), { type: "key", key: "Escape" }],
    ["collapsed + other key", collapsed(), { type: "key", key: "a" }],
    ["collapsed + askOpen", collapsed(), { type: "askOpen" }],
    ["collapsed + askClose", collapsed(), { type: "askClose" }],
    ["collapsed + evidenceToggle", collapsed(), { type: "evidenceToggle" }],
    ["collapsed + unhover", collapsed(), { type: "unhover" }],
    ["collapsed + blur", collapsed(), { type: "blur" }],
    ["collapsed + blurSettled", collapsed(), { type: "blurSettled" }],
    ["collapsed + tapOutside", collapsed(), { type: "tapOutside" }],
    // peek: ask sub-views are unreachable from here
    ["peek + askOpen", peek(), { type: "askOpen" }],
    ["peek + askClose", peek(), { type: "askClose" }],
    ["peek + evidenceToggle", peek(), { type: "evidenceToggle" }],
    ["peek + other key", peek(), { type: "key", key: "a" }],
    ["peek + blurSettled (no pending)", peek(), { type: "blurSettled" }],
    // expanded: askClose only makes sense from ask
    ["expanded + tap", expanded(), { type: "tap" }],
    ["expanded + hover", expanded(), { type: "hover" }],
    ["expanded + focus", expanded(), { type: "focus" }],
    ["expanded + key Enter", expanded(), { type: "key", key: "Enter" }],
    ["expanded + key Space", expanded(), { type: "key", key: " " }],
    ["expanded + other key", expanded(), { type: "key", key: "a" }],
    ["expanded + askClose", expanded(), { type: "askClose" }],
    ["expanded + blurSettled (no pending)", expanded(), { type: "blurSettled" }],
    // ask: askOpen only makes sense from expanded
    ["ask + tap", ask(), { type: "tap" }],
    ["ask + hover", ask(), { type: "hover" }],
    ["ask + focus", ask(), { type: "focus" }],
    ["ask + key Enter", ask(), { type: "key", key: "Enter" }],
    ["ask + key Space", ask(), { type: "key", key: " " }],
    ["ask + other key", ask(), { type: "key", key: "a" }],
    ["ask + askOpen", ask(), { type: "askOpen" }],
    ["ask + blurSettled (no pending)", ask(), { type: "blurSettled" }],
  ];

  for (const [label, s, e] of invalid) {
    test(label, () => {
      expect(circleReducer(s, e)).toBe(s);
    });
  }
});

describe("evidence never leaks across states", () => {
  test("collapsing always resets evidence", () => {
    const withEvidence = state({ state: "expanded", evidence: true });
    for (const e of [
      { type: "key", key: "Escape" },
      { type: "tapOutside" },
      { type: "unhover" },
    ] as CircleEvent[]) {
      expect(circleReducer(withEvidence, e).evidence).toBe(false);
    }
  });

  test("opening ask always starts with evidence off", () => {
    const withEvidence = state({ state: "expanded", evidence: true });
    expect(circleReducer(withEvidence, { type: "askOpen" }).evidence).toBe(false);
  });
});
