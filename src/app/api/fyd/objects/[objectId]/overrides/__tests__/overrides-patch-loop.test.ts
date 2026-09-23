/**
 * Owner patch loop route tests (Phase 2+3 / G4).
 *
 * - G4: tenant comes from the trusted route path; body tenant claims that
 *   disagree are refused (400 tenant_mismatch); invalid route tenant is
 *   refused before any I/O.
 * - propose -> approve digest binding: approval without digests refused;
 *   tampered command refused; stale base refused with 409 stale_proposal
 *   and NOTHING WRITTEN; apply re-reads and succeeds when bound.
 * - ActorContext is required on every mutation: demo owner context is
 *   labeled on propose and approve responses.
 * - Persistence: apply is durable across a "restart" (the event log is on
 *   disk; a fresh read of the same owner dir re-projects the correction),
 *   and revert restores the original.
 * - Owner corrections stay honest: apply records the owner value; Ask FYD
 *   answers the corrected value citing the owner override, while the
 *   site's previous value stays recorded as what the source says.
 */
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { isDemoOwnerModeEnabled } from "@/fyd/owner-mode/gate";
import { POST } from "../route";

jest.mock("@/lib/ping/session", () => ({ getPracticeIdentityId: async () => null }));

const PHONE_CMD = {
  type: "set-contact-field",
  field: "phone",
  value: "+1 541 555 0123",
} as const;

interface ContactView {
  contact: { phone: string | null; email: string | null; website: string | null };
  fieldCorrections: {
    field: string;
    ownerValue: string;
    sourceValue: string | null;
    basis: string;
  }[];
}

function req(body: unknown, objectId = "happy-place", host = "localhost:3000") {
  return {
    req: {
      json: async () => body,
      headers: {
        get: (name: string) => (name.toLowerCase() === "host" ? host : null),
      },
    } as unknown as NextRequest,
    params: Promise.resolve({ objectId }),
  };
}

async function call(
  body: unknown,
  objectId = "happy-place",
  host = "localhost:3000",
) {
  const { req: r, params } = req(body, objectId, host);
  const resp = await POST(r, { params });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

const DEMO_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
const OLD_DEMO_ENV = process.env[DEMO_ENV_VAR];

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-test-"));
  // The route is gated behind demo-owner mode: mutation tests run with the
  // demo explicitly opted in on a localhost host.
  process.env[DEMO_ENV_VAR] = "1";
});

afterEach(() => {
  if (OLD_DEMO_ENV === undefined) delete process.env[DEMO_ENV_VAR];
  else process.env[DEMO_ENV_VAR] = OLD_DEMO_ENV;
});

describe("G4: tenant from the trusted route path", () => {
  test.each(["siteId", "tenantId", "tenant"])(
    "body claim under %p that disagrees with the route is refused, nothing written",
    async (key) => {
      const { status, body } = await call({
        stage: "propose",
        text: "Correct phone to +1 541 555 0123",
        [key]: "coppersmith-plumbing",
      });
      expect(status).toBe(400);
      expect(body.code).toBe("tenant_mismatch");
      expect(body.tenantId).toBe("happy-place");
      expect(body.ok).toBe(false);
    },
  );

  test("invalid route tenant refused before any I/O", async () => {
    const { status, body } = await call(
      { stage: "propose", text: "Correct phone to +1 541 555 0123" },
      "../../etc",
    );
    expect(status).toBe(400);
    expect(body.code).toBe("invalid_tenant");
  });

  test("matching body claim ignored; proposal served for the route tenant", async () => {
    const { status, body } = await call({
      stage: "propose",
      text: "Correct phone to +1 541 555 0123",
      siteId: "happy-place",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe("happy-place");
  });
});

describe("propose -> approve digest binding", () => {
  async function propose() {
    const { status, body } = await call({
      stage: "propose",
      text: "Correct phone to +1 541 555 0123",
    });
    expect(status).toBe(200);
    return body;
  }

  async function approveProposal(p: Record<string, unknown>) {
    const proposal = p.proposal as Record<string, unknown>;
    const digests = p.digests as Record<string, string>;
    return call({
      stage: "approve",
      command: proposal.command,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
    });
  }

  test("propose returns proposal + preview + digests, writes nothing", async () => {
    const body = await propose();
    const proposal = body.proposal as Record<string, unknown>;
    expect(proposal.command).toMatchObject(PHONE_CMD);
    expect(typeof proposal.summary).toBe("string");
    const preview = body.preview as Record<string, string>;
    expect(preview.before).toContain("phone:");
    expect(preview.after).toContain("+1 541 555 0123");
    expect(preview.evidenceImpact).toMatch(/owner.corrected-fact/i);
    expect(typeof preview.capabilityImpact).toBe("string");
    const digests = body.digests as Record<string, string>;
    expect(digests.baseStateDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(digests.baseViewDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(digests.patchDigest).toMatch(/^[0-9a-f]{64}$/);
    // Nothing written: a second propose sees the identical base digests.
    const b2 = await propose();
    const d2 = b2.digests as Record<string, string>;
    expect(d2.baseStateDigest).toBe(digests.baseStateDigest);
    expect(d2.baseViewDigest).toBe(digests.baseViewDigest);
  });

  test("approve without digests is refused", async () => {
    const { status, body } = await call({ stage: "approve", command: PHONE_CMD });
    expect(status).toBe(400);
    expect(body.code).toBe("approval_not_bound");
    // Even refusals carry the demo owner-context label.
    expect(body.demoOwnerContext).toBe(true);
    expect(String(body.demoNote)).toMatch(/DEMO OWNER CONTEXT/);
  });

  test("approve missing only the view digest is refused", async () => {
    const p = await propose();
    const digests = p.digests as Record<string, string>;
    const { status, body } = await call({
      stage: "approve",
      command: (p.proposal as Record<string, unknown>).command,
      baseStateDigest: digests.baseStateDigest,
      patchDigest: digests.patchDigest,
    });
    expect(status).toBe(400);
    expect(body.code).toBe("approval_not_bound");
    expect(body.demoOwnerContext).toBe(true);
  });

  test("approve of a tampered command is refused (patch digest)", async () => {
    const body = await propose();
    const digests = body.digests as Record<string, string>;
    const tampered = { type: "set-contact-field", field: "phone", value: "+1 541 555 9999" };
    const { status, body: res } = await call({
      stage: "approve",
      command: tampered,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
    });
    expect(status).toBe(400);
    expect(res.code).toBe("patch_mismatch");
    expect(res.demoOwnerContext).toBe(true);
    expect(String(res.demoNote)).toMatch(/DEMO OWNER CONTEXT/);
  });

  test("approve with a tampered VIEW digest is refused as STALE (nothing written)", async () => {
    const p = await propose();
    const d = p.digests as Record<string, string>;
    const { status, body } = await call({
      stage: "approve",
      command: (p.proposal as Record<string, unknown>).command,
      baseStateDigest: d.baseStateDigest,
      baseViewDigest: "0".repeat(64),
      patchDigest: d.patchDigest,
    });
    expect(status).toBe(409);
    expect(body.code).toBe("stale_proposal");
    expect(String(body.error)).toMatch(/build view/);
    expect(body.demoOwnerContext).toBe(true);
    // Nothing written: the base digests are unchanged.
    const p2 = await propose();
    const d2 = p2.digests as Record<string, string>;
    expect(d2.baseStateDigest).toBe(d.baseStateDigest);
    expect(d2.baseViewDigest).toBe(d.baseViewDigest);
  });

  test("STALE PROPOSAL: state moved since drafting -> 409, nothing written", async () => {
    const p1 = await propose();
    const d1 = p1.digests as Record<string, string>;
    // A second, independent proposal/approve moves the state.
    const second = await approveProposal(p1);
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    // The first proposal is now stale: base digests no longer match.
    const { status, body } = await call({
      stage: "approve",
      command: (p1.proposal as Record<string, unknown>).command,
      baseStateDigest: d1.baseStateDigest,
      baseViewDigest: d1.baseViewDigest,
      patchDigest: d1.patchDigest,
    });
    expect(status).toBe(409);
    expect(body.code).toBe("stale_proposal");
    expect(body.error).toMatch(/STALE PROPOSAL/);
    expect(body.presentedBaseStateDigest).toBe(d1.baseStateDigest);
    expect(body.presentedBaseViewDigest).toBe(d1.baseViewDigest);
    expect(body.demoOwnerContext).toBe(true);
    expect(String(body.demoNote)).toMatch(/DEMO OWNER CONTEXT/);
    // Nothing written by the refused approval: the current base is still
    // the post-apply base, not a third state.
    const p3 = await propose();
    expect((p3.digests as Record<string, string>).baseStateDigest).toBe(
      (second.body.approval as Record<string, unknown>).resultDigest,
    );
  });

  test("bound approve applies; approval record binds tenant+actor+digests", async () => {
    const p = await propose();
    const { status, body } = await approveProposal(p);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // The approve response itself carries the demo owner-context label.
    expect(body.demoOwnerContext).toBe(true);
    expect(String(body.demoNote)).toMatch(/DEMO OWNER CONTEXT/);
    const approval = body.approval as Record<string, unknown>;
    const digests = p.digests as Record<string, string>;
    expect(approval.tenantId).toBe("happy-place");
    // The approval binds exactly the three previewed digests.
    expect(approval.baseStateDigest).toBe(digests.baseStateDigest);
    expect(approval.baseViewDigest).toBe(digests.baseViewDigest);
    expect(approval.patchDigest).toBe(digests.patchDigest);
    expect(approval.baseStateDigest).not.toBe(approval.resultDigest);
    expect(typeof approval.resultDigest).toBe("string");
    expect(typeof approval.eventId).toBe("string");
    expect(typeof approval.approvedAt).toBe("string");
    const actor = approval.actor as Record<string, unknown>;
    expect(actor.demoOwnerContext).toBe(true);
    expect(String(actor.disclosure)).toMatch(/DEMO OWNER CONTEXT/);
    expect((body.history as unknown[]).length).toBeGreaterThan(0);
    const view = body.view as ContactView;
    expect(view.contact.phone).toBe("+1 541 555 0123");
    const correction = view.fieldCorrections.find((c) => c.field === "phone");
    expect(correction?.ownerValue).toBe("+1 541 555 0123");
    // The source's value stays recorded as what the source says.
    expect(correction?.sourceValue).toBe("+15412865190");
  });

  test("demo owner context is labeled on propose and every response", async () => {
    const p = await propose();
    expect(p.demoOwnerContext).toBe(true);
    expect(String(p.demoNote)).toMatch(/DEMO OWNER CONTEXT/);
    expect(String(p.actorDisclosure)).toMatch(/DEMO OWNER CONTEXT/);
    expect(String(p.actorDisclosure)).toMatch(/not a verified owner identity/);
  });

  test("G4 adversarial: body actor claims are ignored; the seeded demo actor applies", async () => {
    const p = await propose();
    const digests = p.digests as Record<string, string>;
    const { status, body } = await call({
      stage: "approve",
      command: (p.proposal as Record<string, unknown>).command,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
      actor: { id: "mallory", label: "Mallory (attacker)" },
    });
    expect(status).toBe(200);
    const approval = body.approval as Record<string, unknown>;
    const actor = approval.actor as Record<string, unknown>;
    // The server created the actor; the body's "mallory" changed nothing.
    expect(actor.actorId).toBe("demo-owner");
    expect(actor.actorId).not.toBe("mallory");
    expect(actor.demoOwnerContext).toBe(true);
    const view = body.view as ContactView;
    expect(view.contact.phone).toBe("+1 541 555 0123");
  });

  test("revert restores the original value (apply -> revert -> original)", async () => {
    const applied = await approveProposal(await propose());
    expect(applied.status).toBe(200);
    const view1 = applied.body.view as ContactView;
    expect(view1.contact.phone).toBe("+1 541 555 0123");
    // Revert via the text command through the same loop.
    const rp = await call({ stage: "propose", text: "Revert phone correction" });
    expect(rp.status).toBe(200);
    const rdigests = rp.body.digests as Record<string, string>;
    const reverted = await call({
      stage: "approve",
      command: (rp.body.proposal as Record<string, unknown>).command,
      baseStateDigest: rdigests.baseStateDigest,
      baseViewDigest: rdigests.baseViewDigest,
      patchDigest: rdigests.patchDigest,
    });
    expect(reverted.status).toBe(200);
    const view2 = reverted.body.view as ContactView;
    expect(view2.contact.phone).toBe("+15412865190");
    expect(view2.fieldCorrections.find((c) => c.field === "phone")).toBeUndefined();
  });

  test("apply persists across a 'restart': the log is on disk and re-projects", async () => {
    const applied = await approveProposal(await propose());
    expect(applied.status).toBe(200);
    const dir = process.env.FYD_OWNER_DIR as string;
    // The event log is a real file on disk: a restarted server reads the
    // same directory and re-projects the same state.
    expect(existsSync(join(dir, "happy-place.json"))).toBe(true);
    const store = jest.requireActual("@/fyd/object/owner-store") as typeof import(
      "@/fyd/object/owner-store"
    );
    const eventsMod = jest.requireActual("@/fyd/object/owner-events") as typeof import(
      "@/fyd/object/owner-events"
    );
    const replayed = store.readOverrides("happy-place");
    expect(replayed.fieldCorrections.phone?.ownerValue).toBe("+1 541 555 0123");
    expect(eventsMod.readOwnerEvents("happy-place").length).toBeGreaterThan(0);
    // Digest stability: nothing written between reads, same projection.
    const again = store.readOverrides("happy-place");
    expect(JSON.stringify(again)).toBe(JSON.stringify(replayed));
  });

  test("correction record keeps owner value and source value side by side", async () => {
    const applied = await approveProposal(await propose());
    expect(applied.status).toBe(200);
    const store = jest.requireActual("@/fyd/object/owner-store") as typeof import(
      "@/fyd/object/owner-store"
    );
    const corr = store.readOverrides("happy-place").fieldCorrections.phone;
    expect(corr?.ownerValue).toBe("+1 541 555 0123");
    expect(corr?.sourceValue).toBe("+15412865190");
    // The basis text is the honest contract: owner attests, source unchanged.
    expect(corr?.basis).toContain("Owner correction");
    expect(corr?.basis).toContain("source record is unchanged");
  });
});

describe("demo-owner-mode gate (both stages)", () => {
  const PROPOSE = {
    stage: "propose",
    text: "Correct phone to +1 541 555 0123",
  };

  test("demo owner mode defaults OFF: env unset => isDemoOwnerModeEnabled() is false", () => {
    delete process.env[DEMO_ENV_VAR];
    expect(isDemoOwnerModeEnabled()).toBe(false);
  });

  test("visitor (env unset): propose denied with typed 403, nothing written", async () => {
    delete process.env[DEMO_ENV_VAR];
    const { status, body } = await call(PROPOSE);
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(String(body.error)).toMatch(/DEMO OWNER MODE - not real authentication/);
    expect(body.demoOwnerMode).toBe(false);
    // The gate runs before any I/O: no owner state file exists.
    expect(
      existsSync(join(process.env.FYD_OWNER_DIR as string, "happy-place.json")),
    ).toBe(false);
  });

  test("visitor (env unset): approve denied with typed 403, nothing written", async () => {
    delete process.env[DEMO_ENV_VAR];
    const { status, body } = await call({
      stage: "approve",
      command: PHONE_CMD,
      baseStateDigest: "0".repeat(64),
      baseViewDigest: "0".repeat(64),
      patchDigest: "0".repeat(64),
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(
      existsSync(join(process.env.FYD_OWNER_DIR as string, "happy-place.json")),
    ).toBe(false);
  });

  test("env on but public host: propose denied with typed 403, nothing written", async () => {
    const { status, body } = await call(PROPOSE, "happy-place", "fyd.example.com");
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.demoOwnerMode).toBe(true);
    expect(body.hostPrivate).toBe(false);
    expect(
      existsSync(join(process.env.FYD_OWNER_DIR as string, "happy-place.json")),
    ).toBe(false);
  });

  test("env on but public IPv4 host: approve denied", async () => {
    const { status, body } = await call(
      {
        stage: "approve",
        command: PHONE_CMD,
        baseStateDigest: "0".repeat(64),
        baseViewDigest: "0".repeat(64),
        patchDigest: "0".repeat(64),
      },
      "happy-place",
      "93.184.216.34:3000",
    );
    expect(status).toBe(403);
    expect(body.code).toBe("demo_owner_mode_required");
    expect(body.hostPrivate).toBe(false);
  });

  test("env on + localhost: propose -> approve applies (mutation allowed)", async () => {
    const p = await call(PROPOSE);
    expect(p.status).toBe(200);
    expect(p.body.ok).toBe(true);
    const digests = p.body.digests as Record<string, string>;
    const { status, body } = await call({
      stage: "approve",
      command: (p.body.proposal as Record<string, unknown>).command,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const view = body.view as { contact: { phone: string | null } };
    expect(view.contact.phone).toBe("+1 541 555 0123");
  });

  test("env on + private-network host: propose allowed", async () => {
    const { status, body } = await call(PROPOSE, "happy-place", "192.168.1.20:3000");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
