/**
 * OwnerContext seam + authority-gradient route tests.
 *
 * - The route speaks ONLY the OwnerContext interface (never Demo internals
 *   at call sites). Swapping the implementation behind the seam changes
 *   disclosure and capability behavior with identical consuming code.
 * - createOwnerContext is the single construction point: the route builds
 *   its context through the factory, so a future PING implementation swaps
 *   in without touching the route.
 * - The propose/approve loop reflects the authority gradient: LOW
 *   presentation changes are tier-labeled with fast proposal/undo;
 *   MEDIUM changes (address visibility, contact corrections) get explicit
 *   confirmation and no automatic undo; HIGH/CRITICAL never reach propose.
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

function req(body: unknown, objectId = "happy-place") {
  return {
    req: { json: async () => body } as unknown as NextRequest,
    params: Promise.resolve({ objectId }),
  };
}

async function call(body: unknown, objectId = "happy-place") {
  const { req: r, params } = req(body, objectId);
  const resp = await POST(r, { params });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-seam-test-"));
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

  test("unknown capabilities fail closed through the DemoOwnerContext seam", async () => {
    // HIGH-class capabilities do not exist in demo mode; absence must deny,
    // never fall through to the seeded verdict. The question still carries
    // the resource; the answer is never a bare boolean.
    const ctx = await createOwnerContext("happy-place");
    for (const capability of [
      "owner.send-message",
      "owner.spend",
      "owner.provider-mutate",
      "owner.mass-action",
      "owner.external-publish",
    ]) {
      const evaluation = await ctx.evaluateCapability("happy-place", capability);
      expect(evaluation.capability).toBe(capability);
      expect(evaluation.allowed).toBe(false);
      expect(evaluation.reason).toMatch(/deny/);
      expect(evaluation.reason).toMatch(/deny-by-default/);
    }
  });
});

describe("authority gradient on the route", () => {
  test("propose labels an address-visibility change as MEDIUM with explicit confirmation", async () => {
    const { status, body } = await call({
      stage: "propose",
      text: "Hide the business address",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // FYD product authority directive (Nolan 2026-09-25): address
    // visibility is MEDIUM, not LOW. No fast proposal/undo tier.
    expect(body.tier).toBe("MEDIUM");
    expect(body.productTier).toBe("MEDIUM");
    expect(body.changeKind).toBe("update-business");
    expect(String(body.consequenceNote)).toMatch(/Update the business/);
    expect(body.proposal).toMatchObject({
      command: { type: "set-address-visibility", visibility: "hide" },
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
    // FYD product authority directive (Nolan 2026-09-25): a factual
    // correction is public factual presentation, which is MEDIUM.
    expect(body.tier).toBe("MEDIUM");
    expect(String(body.consequenceNote)).toMatch(/Update the business/);
    expect(String(body.consequenceNote)).toMatch(/owner assertion/);
  });

  test("approve of an address-visibility change carries no automatic undo; explicit DEFAULT unwinds it", async () => {
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
    expect(approved.body.tier).toBe("MEDIUM");
    // MEDIUM: no automatic LOW undo. The preference unwinds only through
    // an explicit DEFAULT command in the propose/approve loop.
    expect("undo" in approved.body).toBe(false);
    expect(projectOwnerState("happy-place").addressVisibility).toBe("hide");

    const backToDefault = await call({ stage: "propose", text: "Reset the address visibility" });
    expect(backToDefault.status).toBe(200);
    expect(backToDefault.body.ok).toBe(true);
    expect(backToDefault.body.proposal).toMatchObject({
      command: { type: "set-address-visibility", visibility: "default" },
    });
    const defaultDigests = backToDefault.body.digests as Record<string, string>;
    const defaulted = await call({
      stage: "approve",
      command: (backToDefault.body.proposal as Record<string, unknown>).command,
      baseStateDigest: defaultDigests.baseStateDigest,
      baseViewDigest: defaultDigests.baseViewDigest,
      patchDigest: defaultDigests.patchDigest,
    });
    expect(defaulted.status).toBe(200);
    expect(defaulted.body.ok).toBe(true);
    expect(projectOwnerState("happy-place").addressVisibility).toBe("default");
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
    // MEDIUM: no automatic LOW undo for factual corrections either.
    expect(approved.body.tier).toBe("MEDIUM");
    expect("undo" in approved.body).toBe(false);
  });
});
