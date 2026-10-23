/**
 * Item 2 regression: one dialog primitive, balanced scroll ownership,
 * provable focus contract.
 *
 * Node env: the pure controller unit plus source-level assertions that no
 * competing dialog implementation survives and the native <dialog> path is
 * adopted where the ref is a dialog element.
 */
import * as fs from "fs";
import * as path from "path";
import { createDialogController } from "../use-fyd-dialog";

function harness() {
  const locks: boolean[] = [];
  const returned: unknown[] = [];
  const controller = createDialogController({
    setScrollLock: (locked: boolean) => {
      locks.push(locked);
    },
    returnFocus: (t: unknown) => {
      returned.push(t);
      (t as { focus: () => void }).focus();
    },
  });
  return { controller, locks, returned };
}

function fakeTrigger() {
  const calls: unknown[][] = [];
  return {
    calls,
    focus: (...args: unknown[]) => {
      calls.push(args);
    },
  };
}

test("balance: open -> lock 1; close -> 0; onClose exactly once", () => {
  const { controller, locks, returned } = harness();
  const trigger = fakeTrigger();
  let closes = 0;
  controller.open(trigger);
  expect(controller.depth).toBe(1);
  expect(controller.closed).toBe(false);
  controller.requestClose(() => {
    closes += 1;
  });
  controller.requestClose(() => {
    closes += 1;
  });
  expect(closes).toBe(1);
  expect(controller.depth).toBe(0);
  expect(locks).toEqual([true, false]);
  expect(returned).toEqual([trigger]);
});

test("balance: cancel (Escape) funnels through the same exactly-once close", () => {
  const { controller, locks } = harness();
  let closes = 0;
  controller.open(fakeTrigger());
  // The hook wires native "cancel" and the manual Escape keydown to
  // requestClose; the unit proves the funnel.
  controller.requestClose(() => {
    closes += 1;
  });
  expect(closes).toBe(1);
  expect(controller.depth).toBe(0);
  expect(locks).toEqual([true, false]);
});

test("balance: unmount while open releases without calling onClose", () => {
  const { controller, locks } = harness();
  let closes = 0;
  controller.open(fakeTrigger());
  controller.dispose();
  expect(closes).toBe(0);
  expect(controller.depth).toBe(0);
  expect(controller.closed).toBe(true);
  expect(locks).toEqual([true, false]);
});

test("balance: exception during open leaves depth 0; dispose unlocks nothing", () => {
  const unlocks: boolean[] = [];
  const controller = createDialogController({
    setScrollLock: (locked: boolean) => {
      if (locked) throw new Error("lock failed");
      unlocks.push(locked);
    },
    returnFocus: () => {},
  });
  expect(() => controller.open(fakeTrigger())).toThrow("lock failed");
  expect(controller.depth).toBe(0);
  controller.dispose();
  expect(unlocks).toEqual([]);
});

test("balance: nested double-open stacks to 2 and drains to 0", () => {
  const { controller, locks } = harness();
  controller.open(fakeTrigger());
  controller.open(fakeTrigger());
  expect(controller.depth).toBe(2);
  controller.requestClose(() => {});
  expect(controller.depth).toBe(0);
  expect(locks).toEqual([true, true, false, false]);
});

test("balance: onClose throwing still releases the lock (finally path)", () => {
  const { controller, locks } = harness();
  controller.open(fakeTrigger());
  expect(() =>
    controller.requestClose(() => {
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(controller.depth).toBe(0);
  expect(locks).toEqual([true, false]);
});

const HOOK_SRC = path.join(__dirname, "..", "use-fyd-dialog.ts");
const hookSrc = () => fs.readFileSync(HOOK_SRC, "utf8");

test("background immobile: the close path performs no window.scrollTo", () => {
  // The unit's deps expose no scroll restore at all: with the Lenis lock
  // held, the background cannot move, so there is nothing to restore and
  // no manual scrollTo to fight the scroller.
  const src = hookSrc();
  expect(src).not.toMatch(/window\.scrollTo/);
  expect(src).not.toMatch(/\.scrollTo\(0/);
});

test("focus returns AND is visible: plain focus() then ensureFocusVisible", () => {
  const { controller } = harness();
  const trigger = fakeTrigger();
  controller.open(trigger);
  controller.requestClose(() => {});
  expect(trigger.calls).toHaveLength(1);
  // The preventScroll:true anti-pattern is gone: the call takes no args.
  expect(trigger.calls[0]).toEqual([]);
  expect(hookSrc()).toContain("ensureFocusVisible");
});

test("no competing implementation: use-object-dialog.ts is gone", () => {
  expect(fs.existsSync(path.join(__dirname, "..", "use-object-dialog.ts"))).toBe(false);
});

test("portal-circle migrated to the one hook", () => {
  const portal = fs.readFileSync(path.join(__dirname, "..", "portal-circle.tsx"), "utf8");
  expect(portal).toContain("useFydDialog");
  expect(portal).not.toContain("useObjectDialog");
});

test("native <dialog> adopted where the ref is a dialog element", () => {
  const src = hookSrc();
  expect(src).toContain("HTMLDialogElement");
  expect(src).toContain("showModal");
  expect(src).toContain('"cancel"');
  // The platform close behavior is kept, never preventDefaulted.
  expect(src).not.toMatch(/preventDefault\(\).*cancel|cancel.*preventDefault/);
});
