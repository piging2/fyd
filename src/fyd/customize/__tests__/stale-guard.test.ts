/**
 * Mission H (Flaw D): stale-state guard on the FYD overlay apply path.
 *
 * APPROVED AGAINST STATE S -> EXECUTION MUST VERIFY RELEVANT PRECONDITION
 * STATE STILL MATCHES S, otherwise STALE_APPROVAL / PRECONDITION_CHANGED
 * -> NO EXECUTION, no write. An approved mutation is never silently
 * rebased.
 *
 * Synthetic only: every test drives an in-test fake gateway plus an
 * injected base-state reader. The real demo journal is never touched
 * (its sha256 is asserted unchanged by the mission harness).
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs stale-guard
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  directiveRefsFromJournal,
  emitOverlayEvent,
  layeredSpecDigest,
  verifyStaleGuard,
  StaleGuardError,
  type JournaledDirectiveRef,
  type PresentationIntentOverlayOp,
  type StaleGuardJournalReader,
  type StaleGuardPrecondition,
} from "../server";
import type { FydJournalOverlay } from "@/lib/ping/ping-object-reader";

const BASE_AT_APPROVAL = "aa".repeat(32);
const BASE_DRIFTED = "bb".repeat(32);
const PROPOSAL_DIGEST = "cc".repeat(32);

function setOp(overrides: Record<string, unknown> = {}): PresentationIntentOverlayOp {
  return {
    op: "set_presentation_intent",
    intentId: "pi-synthetic-guard",
    siteIntent: { kind: "edit_copy", pageSlug: "home", sectionId: "home:Services:2" },
    proposal: { kind: "site_patch", proposalDigest: PROPOSAL_DIGEST },
    approval: {
      proposalDigest: PROPOSAL_DIGEST,
      approvedBy: "synthetic-owner",
      approvedAt: "2026-09-28T02:04:52Z",
      note: "synthetic approval for stale-guard tests",
    },
    ...overrides,
  } as PresentationIntentOverlayOp;
}

function precondition(overrides: Partial<StaleGuardPrecondition> = {}): StaleGuardPrecondition {
  return {
    baseSpecDigest: BASE_AT_APPROVAL,
    specDigest: "dd".repeat(32),
    proposalDigests: [PROPOSAL_DIGEST],
    authority: { approvedBy: "synthetic-owner", approvedAt: "2026-09-28T02:04:52Z" },
    ...overrides,
  };
}

const readerFor = (baseSpecDigest: string) => async () => ({
  baseSpecDigest,
  specDigest: "ee".repeat(32),
});

describe("verifyStaleGuard (unit, injected base-state reader)", () => {
  test("matching precondition verifies cleanly", async () => {
    const current = await verifyStaleGuard("synthetic-site", [setOp()], precondition(), readerFor(BASE_AT_APPROVAL));
    expect(current.baseSpecDigest).toBe(BASE_AT_APPROVAL);
  });

  test("drifted base -> STALE_APPROVAL", async () => {
    const err = await verifyStaleGuard("synthetic-site", [setOp()], precondition(), readerFor(BASE_DRIFTED)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
    expect(err.message).toMatch(/Nothing was executed/);
  });

  test("rebased proposal digest -> PRECONDITION_CHANGED", async () => {
    const rebased = setOp({
      proposal: { kind: "site_patch", proposalDigest: "ff".repeat(32) },
      approval: {
        proposalDigest: "ff".repeat(32),
        approvedBy: "synthetic-owner",
        approvedAt: "2026-09-28T02:04:52Z",
        note: "rebased",
      },
    });
    const err = await verifyStaleGuard("synthetic-site", [rebased], precondition(), readerFor(BASE_AT_APPROVAL)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("PRECONDITION_CHANGED");
  });

  test("op count change vs approved -> PRECONDITION_CHANGED", async () => {
    const err = await verifyStaleGuard(
      "synthetic-site",
      [setOp(), setOp({ intentId: "pi-synthetic-guard-2" })],
      precondition(),
      readerFor(BASE_AT_APPROVAL),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("PRECONDITION_CHANGED");
  });

  test("authority swap -> PRECONDITION_CHANGED", async () => {
    const swapped = setOp({
      approval: {
        proposalDigest: PROPOSAL_DIGEST,
        approvedBy: "someone-else",
        approvedAt: "2026-09-28T02:04:52Z",
        note: "spoofed authority",
      },
    });
    const err = await verifyStaleGuard("synthetic-site", [swapped], precondition(), readerFor(BASE_AT_APPROVAL)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("PRECONDITION_CHANGED");
  });

  test("clear op: base check applies, no proposal check", async () => {
    const clearOp: PresentationIntentOverlayOp = { op: "clear_presentation_intent", intentId: "pi-x" };
    // Clear ops carry no proposal: the precondition is base-state only.
    const baseOnly = precondition({ proposalDigests: undefined, authority: undefined });
    const ok = await verifyStaleGuard("synthetic-site", [clearOp], baseOnly, readerFor(BASE_AT_APPROVAL));
    expect(ok.baseSpecDigest).toBe(BASE_AT_APPROVAL);
    const err = await verifyStaleGuard("synthetic-site", [clearOp], baseOnly, readerFor(BASE_DRIFTED)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
  });
});

describe("emitOverlayEvent stale guard (integration, fake gateway)", () => {
  let server: Server;
  let posts: string[];
  let marker: string;

  beforeAll((done) => {
    posts = [];
    marker = "fyd-demo-journal@synthetic-guard";
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ journal: marker }));
        return;
      }
      if (req.method === "POST" && req.url === "/events") {
        let body = "";
        req.on("data", (c: Buffer) => {
          body += c.toString();
        });
        req.on("end", () => {
          posts.push(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ event_id: "fyd-ovl-synthetic-guard-1" }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      process.env.FYD_CUSTOMIZE_GATEWAY_URL = `http://127.0.0.1:${addr.port}/events`;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  beforeEach(() => {
    posts = [];
    marker = "fyd-demo-journal@synthetic-guard";
  });

  test("drift -> STALE_APPROVAL with ZERO writes", async () => {
    const err = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: precondition(),
      staleGuardReadBaseState: readerFor(BASE_DRIFTED),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
    expect(posts).toHaveLength(0);
  });

  test("no drift -> executes normally", async () => {
    const result = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: precondition(),
      staleGuardReadBaseState: readerFor(BASE_AT_APPROVAL),
    });
    expect(result.eventId).toBe("fyd-ovl-synthetic-guard-1");
    expect(posts).toHaveLength(1);
  });

  test("no staleGuard opt -> executes normally (backward compatible)", async () => {
    const result = await emitOverlayEvent("synthetic-site", [setOp()], { timeoutMs: 5000 });
    expect(result.eventId).toBe("fyd-ovl-synthetic-guard-1");
    expect(posts).toHaveLength(1);
  });

  test("Q-P0-04 regression: WRONG_JOURNAL preflight still fires first, zero POSTs", async () => {
    marker = "evil-journal@fake";
    const err = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: precondition(),
      staleGuardReadBaseState: readerFor(BASE_DRIFTED),
    }).catch((e) => e);
    expect(err).not.toBeInstanceOf(StaleGuardError);
    expect(err.message).toMatch(/WRONG_JOURNAL/);
    expect(posts).toHaveLength(0);
  });

  test("H2: concurrent approve between derive and execute -> STALE_APPROVAL with ZERO writes", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const refB = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const err = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: h2Precondition([refA]),
      staleGuardReadBaseState: readerFor(BASE_AT_APPROVAL),
      // The journal moved after derive: a second approval landed first.
      staleGuardReadJournal: async () => [refA, refB],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
    expect(posts).toHaveLength(0);
  });

  test("H2: concurrent clear between derive and execute -> STALE_APPROVAL with ZERO writes", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const refB = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const err = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: h2Precondition([refA, refB]),
      staleGuardReadBaseState: readerFor(BASE_AT_APPROVAL),
      // A clear removed pi-B from the journaled set after derive.
      staleGuardReadJournal: async () => [refA],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
    expect(posts).toHaveLength(0);
  });

  test("H2: no journal movement -> executes normally (no false positive)", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const result = await emitOverlayEvent("synthetic-site", [setOp()], {
      timeoutMs: 5000,
      staleGuard: h2Precondition([refA]),
      staleGuardReadBaseState: readerFor(BASE_AT_APPROVAL),
      staleGuardReadJournal: async () => [refA],
    });
    expect(result.eventId).toBe("fyd-ovl-synthetic-guard-1");
    expect(posts).toHaveLength(1);
  });
});

/**
 * H2 (2026-09-27): layered drift key.
 *
 * Falsifier-H falsified the base-only drift key: baseSpecDigest covers
 * ONLY the base compiled spec, but the overlay applies over base + the
 * journaled directive set accumulated in journal order. A concurrent
 * approve (new directive) or clear (removed directive) landing between
 * derive and execute changed the layered spec the owner approved against
 * without tripping the guard: a silent rebase of an approved mutation.
 *
 * Synthetic only: injected base-state and journal readers. The real demo
 * journal is never touched.
 */
function h2Ref(
  intentId: string,
  digestByte: string,
  eventId: string,
  approvedAt: string,
): JournaledDirectiveRef {
  return {
    intentId,
    proposalDigest: digestByte.repeat(32),
    approvedBy: "synthetic-owner",
    approvedAt,
    eventId,
  };
}

function h2Precondition(refs: JournaledDirectiveRef[]): StaleGuardPrecondition {
  return {
    ...precondition(),
    layeredSpecDigest: layeredSpecDigest(BASE_AT_APPROVAL, refs),
  };
}

const h2JournalFor =
  (refs: JournaledDirectiveRef[]): StaleGuardJournalReader =>
  async () =>
    refs;

function h2JournalOverlay(
  eventId: string,
  intentId: string,
  digestByte: string,
  approvedAt: string,
): FydJournalOverlay {
  const proposalDigest = digestByte.repeat(32);
  return {
    eventId,
    timestamp: "2026-09-28T02:00:00Z",
    ops: [
      {
        op: "set_presentation_intent",
        intentId,
        siteIntent: { kind: "edit_copy" },
        proposal: { kind: "site_patch", proposalDigest },
        approval: {
          proposalDigest,
          approvedBy: "synthetic-owner",
          approvedAt,
          note: "DEMO OWNER MODE - not real authentication. No identity was verified.",
        },
      },
    ],
  };
}

describe("directiveRefsFromJournal (journal accumulation semantics)", () => {
  test("accumulates set ops in journal order; re-approval moves to the end", () => {
    const overlays = [
      h2JournalOverlay("evt-1", "pi-A", "11", "2026-09-28T02:00:00Z"),
      h2JournalOverlay("evt-2", "pi-B", "22", "2026-09-28T02:01:00Z"),
      h2JournalOverlay("evt-3", "pi-A", "33", "2026-09-28T02:02:00Z"),
    ];
    const refs = directiveRefsFromJournal(overlays);
    expect(refs.map((r) => r.intentId)).toEqual(["pi-B", "pi-A"]);
    expect(refs.map((r) => r.eventId)).toEqual(["evt-2", "evt-3"]);
    expect(refs[1].proposalDigest).toBe("33".repeat(32));
    expect(refs[1].approvedAt).toBe("2026-09-28T02:02:00Z");
  });

  test("clear removes the intent from the set", () => {
    const overlays: FydJournalOverlay[] = [
      h2JournalOverlay("evt-1", "pi-A", "11", "2026-09-28T02:00:00Z"),
      h2JournalOverlay("evt-2", "pi-B", "22", "2026-09-28T02:01:00Z"),
      {
        eventId: "evt-3",
        timestamp: "2026-09-28T02:02:00Z",
        ops: [{ op: "clear_presentation_intent", intentId: "pi-A" }],
      },
    ];
    expect(directiveRefsFromJournal(overlays).map((r) => r.intentId)).toEqual([
      "pi-B",
    ]);
  });

  test("non-intent op kinds are ignored (they move the base, covered by baseSpecDigest)", () => {
    const overlays: FydJournalOverlay[] = [
      h2JournalOverlay("evt-1", "pi-A", "11", "2026-09-28T02:00:00Z"),
      {
        eventId: "evt-2",
        timestamp: "2026-09-28T02:01:00Z",
        ops: [{ op: "set_field", objectId: "o1", field: "title", value: "x" }],
      },
    ];
    expect(directiveRefsFromJournal(overlays).map((r) => r.intentId)).toEqual([
      "pi-A",
    ]);
  });

  test("layeredSpecDigest is deterministic and order-sensitive", () => {
    const a = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const b = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const d1 = layeredSpecDigest(BASE_AT_APPROVAL, [a, b]);
    expect(layeredSpecDigest(BASE_AT_APPROVAL, [a, b])).toBe(d1);
    // Journal order is significant: a re-approval moving an intent to the
    // end changes the layered state even with the same intent set.
    expect(layeredSpecDigest(BASE_AT_APPROVAL, [b, a])).not.toBe(d1);
    expect(layeredSpecDigest(BASE_AT_APPROVAL, [a])).not.toBe(d1);
    expect(layeredSpecDigest(BASE_DRIFTED, [a, b])).not.toBe(d1);
  });
});

describe("H2 layered drift key (verifyStaleGuard, injected journal reader)", () => {
  test("concurrent approve (new directive) between derive and execute -> STALE_APPROVAL", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const refB = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const err = await verifyStaleGuard(
      "synthetic-site",
      [setOp()],
      h2Precondition([refA]),
      readerFor(BASE_AT_APPROVAL),
      h2JournalFor([refA, refB]),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
    expect(err.message).toMatch(/directive set moved/);
    expect(err.message).toMatch(/Nothing was executed/);
  });

  test("concurrent clear (directive removed) -> STALE_APPROVAL", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const refB = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const err = await verifyStaleGuard(
      "synthetic-site",
      [setOp()],
      h2Precondition([refA, refB]),
      readerFor(BASE_AT_APPROVAL),
      h2JournalFor([refA]),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
  });

  test("concurrent re-approval (intent moved to the end) -> STALE_APPROVAL", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const refB = h2Ref("pi-B", "22", "evt-2", "2026-09-28T02:01:00Z");
    const refA2 = h2Ref("pi-A", "33", "evt-3", "2026-09-28T02:02:00Z");
    const err = await verifyStaleGuard(
      "synthetic-site",
      [setOp()],
      h2Precondition([refA, refB]),
      readerFor(BASE_AT_APPROVAL),
      h2JournalFor([refB, refA2]),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("STALE_APPROVAL");
  });

  test("no journal movement -> verifies cleanly (no false positive)", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const current = await verifyStaleGuard(
      "synthetic-site",
      [setOp()],
      h2Precondition([refA]),
      readerFor(BASE_AT_APPROVAL),
      h2JournalFor([refA]),
    );
    expect(current.baseSpecDigest).toBe(BASE_AT_APPROVAL);
  });

  test("journal read failure fails closed (throws, no silent skip)", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const boom: StaleGuardJournalReader = async () => {
      throw new Error("journal down");
    };
    const err = await verifyStaleGuard(
      "synthetic-site",
      [setOp()],
      h2Precondition([refA]),
      readerFor(BASE_AT_APPROVAL),
      boom,
    ).catch((e) => e);
    expect(err).not.toBeInstanceOf(StaleGuardError);
    expect(err.message).toMatch(/journal down/);
  });

  test("approvedAt swap -> PRECONDITION_CHANGED (carried fields are checked)", async () => {
    const refA = h2Ref("pi-A", "11", "evt-1", "2026-09-28T02:00:00Z");
    const swapped = setOp({
      approval: {
        proposalDigest: PROPOSAL_DIGEST,
        approvedBy: "synthetic-owner",
        approvedAt: "2026-09-28T03:00:00Z",
        note: "timestamp swapped",
      },
    });
    const err = await verifyStaleGuard(
      "synthetic-site",
      [swapped],
      h2Precondition([refA]),
      readerFor(BASE_AT_APPROVAL),
      h2JournalFor([refA]),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StaleGuardError);
    expect(err.code).toBe("PRECONDITION_CHANGED");
  });
});
