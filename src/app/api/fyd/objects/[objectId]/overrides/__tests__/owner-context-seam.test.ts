/**
 * OwnerContext seam + authority-gradient route tests.
 *
 * - The route speaks ONLY the OwnerContext interface (never Demo internals
 *   at call sites). Swapping the implementation behind the seam changes
 *   disclosure and capability behavior with identical consuming code.
 * - createOwnerContext is the single construction point: the route builds
 *   its context through the factory, so a future PING implementation swaps
 *   in without touching the route.
 * - The propose/approve loop reflects the authority gradient: presentation
 *   changes are tier-labeled with fast proposal/undo; factual changes get
 *   explicit confirmation and no undo affordance.
 *
 * Binding: FYD-24H-BUILDER-DECISIONS 2026-09-22 (AUTHORITY GRADIENT).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { POST } from "../route";
import {
  createOwnerContext,
  ownerContextRefusalLabel,
  type OwnerCapabilityEvaluation,
  type OwnerContext,
} from "../owner-context";
import type { OwnerActor } from "../patch-loop";
import { projectOwnerState } from "@/fyd/object/owner-events";

jest.mock("@/lib/ping/session", () => ({ getPracticeIdentityId: async () => null }));

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

async function call(body: unknown, objectId = "happy-place", host = "localhost:3000") {
  const { req: r, params } = req(body, objectId, host);
  const resp = await POST(r, { params });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

const DEMO_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";
const OLD_DEMO_ENV = process.env[DEMO_ENV_VAR];

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-seam-test-"));
  // The route is gated behind demo-owner mode: these tests exercise the
  // mutation path with the demo explicitly opted in on a localhost host.
  process.env[DEMO_ENV_VAR] = "1";
});

afterEach(() => {
  if (OLD_DEMO_ENV === undefined) delete process.env[DEMO_ENV_VAR];
  else process.env[DEMO_ENV_VAR] = OLD_DEMO_ENV;
});

/**
 * A strict stand-in OwnerContext: denies the capability and discloses a
 * verified (production) identity. It satisfies the same interface the
 * route speaks, with none of the demo's behavior.
 */
class StrictOwnerContext implements OwnerContext {
  readonly tenantId = "happy-place";
  readonly actor: OwnerActor = {
    actorId: "owner-7",
    label: "Verified Owner",
    disclosure:
      "PRODUCTION OWNER CONTEXT: 'Verified Owner' is a verified owner identity.",
  };
  readonly disclosure = this.actor.disclosure;
  responseLabel(): Record<string, unknown> {
    return { productionOwnerContext: true as const };
  }
  async evaluateCapability(
    _objectId: string,
    capability: string,
  ): Promise<OwnerCapabilityEvaluation> {
    return {
      capability,
      allowed: false,
      reason: "Strict stub denies every mutation.",
    };
  }
  capabilityImpactLine(evaluation: OwnerCapabilityEvaluation): string {
    return (
      "Capability " +
      evaluation.capability +
      ": DENIED under PRODUCTION OWNER CONTEXT. " +
      evaluation.reason
    );
  }
  auditView(): Record<string, unknown> {
    return { stub: true as const, tenantId: this.tenantId };
  }
}

/**
 * The exact call-site sequence the route performs against the seam,
 * parameterized by the context: identical code, whichever implementation
 * sits behind the interface.
 */
async function runRouteCallSites(ctx: OwnerContext) {
  const evaluation = await ctx.evaluateCapability("happy-place", "owner.correct-fact");
  return {
    label: ctx.responseLabel(),
    disclosure: ctx.disclosure,
    impact: ctx.capabilityImpactLine(evaluation),
    allowed: evaluation.allowed,
    tenantId: ctx.tenantId,
    actorLabel: ctx.actor.label,
  };
}

describe("OwnerContext seam: swapping implementations", () => {
  test("identical call sites, different disclosure and capability behavior", async () => {
    const demo = await runRouteCallSites(await createOwnerContext("happy-place"));
    const strict = await runRouteCallSites(new StrictOwnerContext());

    // Disclosure differs at the seam, not at the call sites.
    expect(demo.label).toEqual(ownerContextRefusalLabel());
    expect(demo.label.demoOwnerContext).toBe(true);
    expect(demo.disclosure).toMatch(/DEMO OWNER CONTEXT/);
    expect(strict.label).toEqual({ productionOwnerContext: true });
    expect(strict.disclosure).toMatch(/PRODUCTION OWNER CONTEXT/);

    // Capability behavior differs at the seam, not at the call sites.
    expect(demo.allowed).toBe(true);
    expect(demo.impact).toMatch(/ALLOWED/);
    expect(strict.allowed).toBe(false);
    expect(strict.impact).toMatch(/DENIED/);

    // Tenant scoping and actor identity flow through the same surface.
    expect(demo.tenantId).toBe("happy-place");
    expect(strict.tenantId).toBe("happy-place");
    expect(demo.actorLabel).toMatch(/demo/i);
    expect(strict.actorLabel).toBe("Verified Owner");
  });

  test("createOwnerContext is the single construction point (demo today)", async () => {
    const ctx = await createOwnerContext("happy-place");
    // The route stamps every response through the seam: demo honesty is
    // structural, never decorative.
    expect(ctx.responseLabel().demoOwnerContext).toBe(true);
    expect(ctx.disclosure).toMatch(/DEMO OWNER CONTEXT/);
    expect(ctx.disclosure).toMatch(/not a verified owner identity/);
  });

  test("the seam's refusal label covers pre-context failures", () => {
    const label = ownerContextRefusalLabel();
    expect(label.demoOwnerContext).toBe(true);
    expect(label.demoNote).toMatch(/DEMO OWNER CONTEXT/);
  });
});

describe("authority gradient on the route", () => {
  test("propose labels a presentation change with the fast proposal/undo tier", async () => {
    const { status, body } = await call({
      stage: "propose",
      text: "Hide the business address",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tier).toBe("presentation");
    expect(String(body.consequenceNote)).toMatch(/proposal\/undo/);
    expect(body.proposal).toMatchObject({
      command: { type: "set-address-visibility", visibility: "hidden" },
    });
    expect(body.demoOwnerContext).toBe(true);
  });

  test("propose labels a factual change with the explicit-confirmation tier", async () => {
    const { status, body } = await call({
      stage: "propose",
      text: "Correct phone to +1 555 000 1234",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tier).toBe("factual");
    expect(String(body.consequenceNote)).toMatch(/Explicit confirmation/);
  });

  test("approve of a presentation change returns a ready undo; the undo applies in one call", async () => {
    const proposed = await call({ stage: "propose", text: "Hide the business address" });
    const digests = proposed.body.digests as Record<string, string>;
    const approved = await call({
      stage: "approve",
      command: (proposed.body.proposal as Record<string, unknown>).command,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.ok).toBe(true);
    expect(approved.body.tier).toBe("presentation");
    const undo = approved.body.undo as Record<string, unknown>;
    expect(undo).toBeDefined();
    expect(undo.command).toEqual({
      type: "set-address-visibility",
      visibility: "public",
    });
    expect(String(undo.summary)).toMatch(/show the business address/i);
    expect(typeof undo.baseStateDigest).toBe("string");
    expect(typeof undo.baseViewDigest).toBe("string");
    expect(typeof undo.patchDigest).toBe("string");

    // Fast undo: the pre-bound inverse approves in one call, no re-propose.
    const undone = await call({
      stage: "approve",
      command: undo.command,
      baseStateDigest: undo.baseStateDigest,
      baseViewDigest: undo.baseViewDigest,
      patchDigest: undo.patchDigest,
    });
    expect(undone.status).toBe(200);
    expect(undone.body.ok).toBe(true);
    expect(projectOwnerState("happy-place").addressVisibility).toBe("public");
  });

  test("approve of a factual change carries no undo affordance", async () => {
    const proposed = await call({
      stage: "propose",
      text: "Correct phone to +1 555 000 1234",
    });
    const digests = proposed.body.digests as Record<string, string>;
    const approved = await call({
      stage: "approve",
      command: (proposed.body.proposal as Record<string, unknown>).command,
      baseStateDigest: digests.baseStateDigest,
      baseViewDigest: digests.baseViewDigest,
      patchDigest: digests.patchDigest,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.ok).toBe(true);
    expect(approved.body.tier).toBe("factual");
    expect("undo" in approved.body).toBe(false);
  });
});
