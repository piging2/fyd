/**
 * Unit tests for the one-expanded coordination module (expansion.ts).
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 *
 * The module is pure logic (no React, no DOM): a module-level claim
 * registry enforcing the one-expanded invariant, plus two peer buses
 * (open requests and navigate requests) that the layer and the slots
 * share. These tests pin the registry contract the useClaim hook in
 * ObjectCircle.tsx relies on:
 *   - every claim is broadcast to every expanded-subscriber, so a slot
 *     whose id is not the active one closes (supersede closes);
 *   - claimExpanded(null) releases the slot;
 *   - the open and navigate buses fan out independently and never touch
 *     each other's state or the expanded slot.
 *
 * NOTE: useClaim itself is a React hook (useState + useEffect + timers).
 * The repo's UI test harness is renderToString under a node test
 * environment (see fyd-circle.test.tsx): effects never run there, so the
 * hook's subscription behavior cannot be exercised without a DOM test
 * renderer, which the repo does not have and this lane may not add.
 * The registry and buses below are the pure, logic-level core of the
 * interaction state machine; the hook is a thin adapter over them.
 */

import {
  claimExpanded,
  currentExpandedId,
  requestObjectNavigate,
  requestObjectOpen,
  subscribeExpanded,
  subscribeNavigateRequest,
  subscribeOpenRequest,
} from "@/fyd/ui/object-layer/expansion";

// Module state is shared across tests in this file: unsubscribe every
// subscriber and release the slot after each test so tests are
// order-independent.
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  claimExpanded(null);
});

function onExpanded(fn: (id: string | null) => void): () => void {
  const unsub = subscribeExpanded(fn);
  cleanups.push(unsub);
  return unsub;
}

function onOpenRequest(fn: (id: string) => void): () => void {
  const unsub = subscribeOpenRequest(fn);
  cleanups.push(unsub);
  return unsub;
}

function onNavigateRequest(fn: (id: string) => void): () => void {
  const unsub = subscribeNavigateRequest(fn);
  cleanups.push(unsub);
  return unsub;
}

describe("one-expanded claim registry", () => {
  test("claiming notifies subscribers and sets the current id", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("obj-a");
    expect(seen).toEqual(["obj-a"]);
    expect(currentExpandedId()).toBe("obj-a");
  });

  test("a second claim supersedes the first: everyone hears the new id", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("obj-a");
    claimExpanded("obj-b");
    // Broadcast, no dedupe: slots compare the id to their own claim id
    // and close when it is not theirs (supersede closes).
    expect(seen).toEqual(["obj-a", "obj-b"]);
    expect(currentExpandedId()).toBe("obj-b");
  });

  test("claiming the same id twice re-broadcasts (no dedupe)", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("obj-a");
    claimExpanded("obj-a");
    expect(seen).toEqual(["obj-a", "obj-a"]);
    expect(currentExpandedId()).toBe("obj-a");
  });

  test("claimExpanded(null) releases the slot", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("obj-a");
    claimExpanded(null);
    expect(seen).toEqual(["obj-a", null]);
    expect(currentExpandedId()).toBeNull();
  });

  test("multiple subscribers all receive every claim", () => {
    const first: Array<string | null> = [];
    const second: Array<string | null> = [];
    onExpanded((id) => first.push(id));
    onExpanded((id) => second.push(id));
    claimExpanded("obj-a");
    expect(first).toEqual(["obj-a"]);
    expect(second).toEqual(["obj-a"]);
  });

  test("unsubscribing stops notifications for that listener only", () => {
    const kept: Array<string | null> = [];
    const dropped: Array<string | null> = [];
    const unsub = onExpanded((id) => dropped.push(id));
    onExpanded((id) => kept.push(id));
    // Remove from the auto-cleanup list too: it is already unsubscribed.
    cleanups.splice(cleanups.indexOf(unsub), 1);
    unsub();
    claimExpanded("obj-a");
    expect(dropped).toEqual([]);
    expect(kept).toEqual(["obj-a"]);
  });
});

describe("open-request bus", () => {
  test("requestObjectOpen fans out to every open-request subscriber", () => {
    const first: string[] = [];
    const second: string[] = [];
    onOpenRequest((id) => first.push(id));
    onOpenRequest((id) => second.push(id));
    requestObjectOpen("obj-x");
    expect(first).toEqual(["obj-x"]);
    expect(second).toEqual(["obj-x"]);
  });

  test("unsubscribing stops open requests", () => {
    const seen: string[] = [];
    const unsub = onOpenRequest((id) => seen.push(id));
    cleanups.splice(cleanups.indexOf(unsub), 1);
    unsub();
    requestObjectOpen("obj-x");
    expect(seen).toEqual([]);
  });

  test("open requests never touch the expanded slot", () => {
    const expandedSeen: Array<string | null> = [];
    onExpanded((id) => expandedSeen.push(id));
    onOpenRequest(() => {});
    claimExpanded("obj-a");
    requestObjectOpen("obj-a");
    expect(expandedSeen).toEqual(["obj-a"]);
    expect(currentExpandedId()).toBe("obj-a");
  });
});

describe("navigate bus", () => {
  test("requestObjectNavigate fans out to every navigate subscriber", () => {
    const first: string[] = [];
    const second: string[] = [];
    onNavigateRequest((id) => first.push(id));
    onNavigateRequest((id) => second.push(id));
    requestObjectNavigate("obj-y");
    expect(first).toEqual(["obj-y"]);
    expect(second).toEqual(["obj-y"]);
  });

  test("unsubscribing stops navigate requests", () => {
    const seen: string[] = [];
    const unsub = onNavigateRequest((id) => seen.push(id));
    cleanups.splice(cleanups.indexOf(unsub), 1);
    unsub();
    requestObjectNavigate("obj-y");
    expect(seen).toEqual([]);
  });

  test("navigate requests leave the expanded slot and the open bus alone", () => {
    const expandedSeen: Array<string | null> = [];
    const opened: string[] = [];
    onExpanded((id) => expandedSeen.push(id));
    onOpenRequest((id) => opened.push(id));
    onNavigateRequest(() => {});
    claimExpanded("obj-a");
    requestObjectNavigate("obj-b");
    // The layer owns the collapse/scroll/open choreography; the bus only
    // carries the request.
    expect(expandedSeen).toEqual(["obj-a"]);
    expect(currentExpandedId()).toBe("obj-a");
    expect(opened).toEqual([]);
  });
});

describe("peek and pinned share one claim slot", () => {
  // The REST -> PEEK -> PINNED state machine (useClaim in
  // ObjectCircle.tsx) claims the same slot id in every phase: the
  // registry is phase-agnostic. A peek claim and a pin claim for the
  // same object are the same claim; a peer's peek supersedes our pin.
  test("peek claim then pin claim for the same id is one claim", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("happy-place"); // peek
    claimExpanded("happy-place"); // pin
    expect(seen).toEqual(["happy-place", "happy-place"]);
    expect(currentExpandedId()).toBe("happy-place");
  });

  test("a peer's peek supersedes our pinned claim", () => {
    const seen: Array<string | null> = [];
    onExpanded((id) => seen.push(id));
    claimExpanded("happy-place"); // our pin
    claimExpanded("coppersmith-plumbing"); // peer peek: supersede closes us
    expect(seen).toEqual(["happy-place", "coppersmith-plumbing"]);
    expect(currentExpandedId()).toBe("coppersmith-plumbing");
  });

  test("cluster member claims share the slot with object claims", () => {
    claimExpanded("happy-place");
    claimExpanded("sheet");
    expect(currentExpandedId()).toBe("sheet");
  });
});
