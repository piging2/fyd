/**
 * Ask FYD lane tests: deterministic proposal digest, tamper evidence,
 * capability gating, agent boundary law, and capability-gated rendering.
 *
 * Run with: npx jest src/fyd/ask/__tests__/ask-fyd.test.ts
 */

import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { proposalDigest, verifyProposalDigest } from "../../../lib/ping/ask-composer";
import { planActions } from "../../../lib/ping/action-planner";
import type { PlannerInput } from "../../../lib/ping/action-planner";
import { grantsForViewer } from "../../../lib/ping/grants";
import {
  agentGrants,
  assertAgentEffectAllowed,
  canAgentAuthorize,
  expandPermissionSet,
  FORBIDDEN_AGENT_EFFECTS,
} from "../capabilities";
import { buildAskFydContext } from "../context-builder";
import { payloadHash, signEnvelope, verifyEnvelope } from "../envelope";
import type { Signer } from "../envelope";
import {
  buildSitePatchCard,
  detectSitePatchIntent,
  draftSitePatchProposal,
  signSitePatchDraft,
  verifySignedSitePatchDraft,
} from "../site-patch";
import { composeAskFyd } from "../answer";
import { circleUiActions } from "../circle-actions";
import type {
  ActionKind,
  AskProposal,
  CapabilityPlan,
  FydGrant,
  PingObject,
} from "../../../lib/ping/types";
import type { SiteSpecSummary } from "../site-spec";
import type { AskFydContextInput } from "../types";

const ALICE = "alice-test-id";
const BOB = "bob-test-id";

function makeObject(overrides: Partial<PingObject> = {}): PingObject {
  return {
    id: "obj-1",
    schema: "ping.social.business@1",
    controllerId: ALICE,
    visibility: "public",
    title: "Alice Electric",
    description: "Electrical services in Grand Junction.",
    fields: {},
    provenance: { kind: "canonical-journal", ref: "evt-test-1", derivedAt: "2026-09-21T00:00:00.000Z" },
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

function makeService(id: string, title: string): PingObject {
  return makeObject({ id, schema: "ping.social.service@1", title, controllerId: ALICE });
}

function makeSpec(): SiteSpecSummary {
  return {
    siteId: "obj-1",
    pageSlug: "home",
    digest: "a".repeat(64),
    page: {
      slug: "home",
      title: "Alice Electric",
      navLabel: "Home",
      sections: [
        { id: "home:Hero:0", component: "Hero", query: { kind: "owner" }, presentation: {} },
        {
          id: "home:Services:1",
          component: "Services",
          query: { kind: "all", schema: "ping.social.service@1" },
          presentation: {},
        },
        {
          id: "home:Projects:2",
          component: "Projects",
          query: { kind: "all", schema: "ping.social.project@1" },
          presentation: {},
        },
      ],
    },
    sectionObjects: {
      "home:Hero:0": ["obj-1"],
      "home:Services:1": ["svc-plumbing", "svc-electrical"],
      "home:Projects:2": ["proj-downtown"],
    },
    presentation: {
      "home:Hero:0": { tone: "casual", heading: "Alice Electric" },
      "home:Services:1": { featuredIds: [] },
      "home:Projects:2": { featuredIds: [] },
    },
  };
}

function makeCtx(overrides: Partial<AskFydContextInput> = {}) {
  const target = makeObject();
  const related = [
    makeService("svc-electrical", "Electrical"),
    makeService("svc-plumbing", "Plumbing"),
    makeObject({
      id: "proj-downtown",
      schema: "ping.social.project@1",
      title: "Downtown Remodel",
      controllerId: ALICE,
    }),
  ];
  return buildAskFydContext({
    viewer: { id: ALICE, displayName: "Alice" },
    target,
    relatedObjects: related,
    relationships: [],
    plan: null,
    grants: grantsForViewer({ viewerId: ALICE, controllerId: ALICE, isSite: true }),
    siteSpec: makeSpec(),
    question: "Put my electrical services first",
    ...overrides,
  });
}

function testSigner(): Signer {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDerHex = publicKey.export({ type: "spki", format: "der" }).toString("hex");
  const priv = createPrivateKey({
    key: privateKey.export({ type: "pkcs8", format: "der" }),
    format: "der",
    type: "pkcs8",
  });
  return {
    sign: (bytes: string) => sign(null, Buffer.from(bytes, "utf8"), priv).toString("hex"),
    publicKeyDerHex,
  };
}

function draftReorderProposal(): AskProposal {
  const ctx = makeCtx();
  const intent = detectSitePatchIntent(ctx, "Put my electrical services first");
  expect(intent).toEqual({ kind: "reorder_services_first", serviceName: "electrical services" });
  if (!intent) throw new Error("expected an intent");
  const drafted = draftSitePatchProposal(ctx, intent);
  if (!("proposal" in drafted)) throw new Error(`expected a proposal, got refusal: ${drafted.refusal}`);
  return drafted.proposal;
}

describe("canonical envelope", () => {
  test("sign then verify round-trips", () => {
    const env = signEnvelope({ kind: "site_patch", n: 1 }, testSigner());
    expect(verifyEnvelope(env)).toBe(true);
  });

  test("payload_hash binds the stripped body", () => {
    const env = signEnvelope({ kind: "site_patch", n: 1 }, testSigner());
    expect(env.payload_hash).toBe(payloadHash(env.body));
  });

  test("signing is deterministic", () => {
    const signer = testSigner();
    const a = signEnvelope({ x: [3, 1, 2] }, signer);
    const b = signEnvelope({ x: [3, 1, 2] }, signer);
    expect(a.proof.signature).toBe(b.proof.signature);
    expect(a.payload_hash).toBe(b.payload_hash);
  });

  test("tampering with the body fails verification", () => {
    const env = signEnvelope({ kind: "site_patch", n: 1 }, testSigner());
    expect(verifyEnvelope({ ...env, body: { ...env.body, n: 2 } })).toBe(false);
  });

  test("tampering with the hash binding fails verification", () => {
    const env = signEnvelope({ kind: "site_patch" }, testSigner());
    expect(verifyEnvelope({ ...env, payload_hash: "b".repeat(64) })).toBe(false);
  });

  test("a forged signature fails verification", () => {
    const env = signEnvelope({ kind: "site_patch" }, testSigner());
    const forged = { ...env, proof: { ...env.proof, signature: "00".repeat(64) } };
    expect(verifyEnvelope(forged)).toBe(false);
  });

  test("malformed envelopes fail closed without throwing", () => {
    const env = signEnvelope({ kind: "site_patch" }, testSigner());
    expect(verifyEnvelope({ ...env, proof: { ...env.proof, public_key: "not-hex" } })).toBe(false);
    expect(verifyEnvelope({ ...env, body: "nope" } as never)).toBe(false);
  });
});

describe("site-patch proposal digest", () => {
  test("drafting is deterministic and verifies", () => {
    const a = draftReorderProposal();
    const b = draftReorderProposal();
    expect(a.digest).toBe(b.digest);
    expect(a.digestAlgorithm).toBe("sha256-canonical-json-v1");
    expect(verifyProposalDigest(a)).toBe(true);
  });

  test("the digest binds the site spec digest", () => {
    const p = draftReorderProposal();
    if (p.kind !== "site_patch") throw new Error("expected site_patch");
    expect(p.sitePatch.siteSpecDigest).toBe("a".repeat(64));
  });

  test("tampering with an operation breaks the digest", () => {
    const p = draftReorderProposal();
    if (p.kind !== "site_patch") throw new Error("expected site_patch");
    const op = p.sitePatch.operations[0];
    if (op.op !== "reorder_section_objects") throw new Error("expected reorder");
    const tampered: AskProposal = {
      ...p,
      sitePatch: { ...p.sitePatch, operations: [{ ...op, after: [...op.after].reverse() }] },
    };
    expect(verifyProposalDigest(tampered)).toBe(false);
    expect(verifySignedSitePatchDraft(tampered)).toBe(false);
  });

  test("signed draft verifies and the envelope hash equals the digest", () => {
    const signed = signSitePatchDraft(draftReorderProposal(), testSigner());
    expect(signed.envelope?.payload_hash).toBe(signed.digest);
    expect(verifySignedSitePatchDraft(signed)).toBe(true);
  });

  test("a broken envelope fails closed", () => {
    const signed = signSitePatchDraft(draftReorderProposal(), testSigner());
    const broken: AskProposal = {
      ...signed,
      envelope: signed.envelope && { ...signed.envelope, payload_hash: "b".repeat(64) },
    };
    expect(verifySignedSitePatchDraft(broken)).toBe(false);
  });

  test("existing object_update digests still verify (no regression)", () => {
    const body = {
      kind: "object_update" as const,
      targetObjectId: "obj-1",
      schema: "ping.social.business@1",
      changes: { description: "New description" },
    };
    const proposal: AskProposal = {
      ...body,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256-canonical-json-v1",
      note: "test",
    };
    expect(verifyProposalDigest(proposal)).toBe(true);
  });
});

describe("site-patch intent detection", () => {
  test("reorder phrasings", () => {
    const ctx = makeCtx();
    expect(detectSitePatchIntent(ctx, "Put my electrical services first")).toEqual({
      kind: "reorder_services_first",
      serviceName: "electrical services",
    });
    expect(detectSitePatchIntent(ctx, "Move plumbing to the top")).toEqual({
      kind: "reorder_services_first",
      serviceName: "plumbing",
    });
  });

  test("professionalize phrasings", () => {
    const ctx = makeCtx();
    expect(detectSitePatchIntent(ctx, "Make this more professional")).toEqual({ kind: "professionalize" });
    expect(detectSitePatchIntent(ctx, "Polish up the tone of the site")).toEqual({ kind: "professionalize" });
  });

  test("feature phrasing grounds to the matching object", () => {
    const ctx = makeCtx();
    expect(detectSitePatchIntent(ctx, "Feature Downtown Remodel")).toEqual({
      kind: "feature_object",
      objectId: "proj-downtown",
      objectTitle: "Downtown Remodel",
    });
  });

  test("ordinary questions are not site-patch intents", () => {
    const ctx = makeCtx();
    expect(detectSitePatchIntent(ctx, "What are your hours?")).toBeNull();
    expect(detectSitePatchIntent(ctx, "Propose updating the description to: hello")).toBeNull();
    expect(detectSitePatchIntent(ctx, "Who was first to open?")).toBeNull();
  });
});

describe("capability gating", () => {
  function plannerInput(viewerId: string | null, grants?: FydGrant[]): PlannerInput {
    return {
      viewerId,
      target: makeObject(),
      targetIdentityId: ALICE,
      followedByViewer: false,
      likedByViewer: false,
      website: null,
      grants,
    };
  }

  test("non-owner gets no site proposal action", () => {
    const grants = grantsForViewer({ viewerId: BOB, controllerId: ALICE, isSite: true });
    expect(grants).not.toContain("site.propose");
    const plan = planActions(plannerInput(BOB, grants));
    expect(plan.actions.some((a) => a.kind === "propose_site_patch")).toBe(false);
    expect(plan.actions.some((a) => a.kind === "open_site")).toBe(false);
  });

  test("owner with the maintain_site bundle gets propose_site_patch and open_site", () => {
    const grants = grantsForViewer({ viewerId: ALICE, controllerId: ALICE, isSite: true });
    expect(grants).toEqual(expect.arrayContaining(["site.read", "site.propose", "object.reference"]));
    const plan = planActions(plannerInput(ALICE, grants));
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds).toContain("propose_site_patch");
    expect(kinds).toContain("open_site");
    const propose = plan.actions.find((a) => a.kind === "propose_site_patch");
    expect(propose?.reason).toMatch(/site\.propose/);
    expect(plan.capabilities).toContain("propose_site_patch");
  });

  test("grants never replace capability reasoning: legacy callers keep legacy behavior", () => {
    const plan = planActions(plannerInput(ALICE));
    expect(plan.actions.some((a) => a.kind === "propose_site_patch")).toBe(false);
    expect(plan.actions.some((a) => a.kind === "open_site")).toBe(false);
  });

  test("non-site objects never get site grants", () => {
    const grants = grantsForViewer({ viewerId: ALICE, controllerId: ALICE, isSite: false });
    expect(grants).not.toContain("site.propose");
    expect(grants).not.toContain("site.read");
  });
});

describe("agent boundary law", () => {
  test("forbidden effects are never agent-authorized", () => {
    for (const grant of FORBIDDEN_AGENT_EFFECTS) {
      expect(canAgentAuthorize(grant)).toBe(false);
      expect(() => assertAgentEffectAllowed(grant)).toThrow();
    }
  });

  test("agent grants strip forbidden effects", () => {
    const all: FydGrant[] = ["site.read", "site.propose", "site.publish", "message.send", "object.reference"];
    expect(agentGrants(all)).toEqual(["site.read", "site.propose", "object.reference"]);
  });

  test("the maintain_site bundle never includes publish", () => {
    const grants = expandPermissionSet("maintain_site");
    expect(grants).toEqual(["site.read", "site.propose", "object.reference"]);
    expect(grants).not.toContain("site.publish");
  });

  test("unknown permission sets throw", () => {
    expect(() => expandPermissionSet("nope")).toThrow();
  });

  test("the agent context exposes only agent-safe grants and the digest binding", () => {
    const ctx = makeCtx();
    expect(ctx.agentGrantList).not.toContain("site.publish");
    expect(ctx.capabilitiesLine).toBe(ctx.agentGrantList.join(","));
    expect(ctx.siteSpecDigest).toBe("a".repeat(64));
    expect(ctx.forbiddenEffects).toContain("site.publish");
  });
});

describe("composeAskFyd", () => {
  test("a site-change request drafts a digest-bound proposal with a review card", () => {
    const ctx = makeCtx();
    const answer = composeAskFyd(ctx, "Put my electrical services first");
    expect(answer.proposal?.kind).toBe("site_patch");
    const card = answer.sitePatchCard;
    expect(card).not.toBeNull();
    expect(card?.before.length).toBeGreaterThan(0);
    expect(card?.after.length).toBeGreaterThan(0);
    expect(card?.evidenceReason.length).toBeGreaterThan(0);
    expect(card?.affectedObjects.length).toBeGreaterThan(0);
    expect(card?.siteSpecDigest).toBe("a".repeat(64));
    expect(card && buildSitePatchCard(ctx, answer.proposal as AskProposal)).toEqual(card);
  });

  test("a non-owner gets an honest refusal, not a draft", () => {
    const ctx = makeCtx({
      grants: grantsForViewer({ viewerId: BOB, controllerId: ALICE, isSite: true }),
      viewer: { id: BOB, displayName: "Bob" },
    });
    const answer = composeAskFyd(ctx, "Put my electrical services first");
    expect(answer.proposal).toBeNull();
    expect(answer.sitePatchCard).toBeNull();
    expect(answer.answer).toMatch(/controlling identity/i);
  });

  test("a missing site spec gets an honest refusal", () => {
    const ctx = makeCtx({ siteSpec: null });
    const answer = composeAskFyd(ctx, "Make this more professional");
    expect(answer.proposal).toBeNull();
    expect(answer.answer).toMatch(/site spec/i);
  });

  test("professionalize drafts a tone transition", () => {
    const answer = composeAskFyd(makeCtx(), "Make this more professional");
    expect(answer.proposal?.kind).toBe("site_patch");
    if (answer.proposal?.kind !== "site_patch") throw new Error("expected site_patch");
    const op = answer.proposal.sitePatch.operations[0];
    expect(op.op).toBe("set_presentation");
    if (op.op !== "set_presentation") throw new Error("expected set_presentation");
    expect(op.field).toBe("tone");
    expect(op.after).toBe("professional");
  });

  test("an ungroundable request explains instead of drafting", () => {
    const answer = composeAskFyd(makeCtx(), "Put my dragon services first");
    expect(answer.proposal).toBeNull();
    expect(answer.answer).toMatch(/could not find a service/i);
  });

  test("ordinary questions use the evidence-backed composer", () => {
    const answer = composeAskFyd(makeCtx(), "What services are offered?");
    expect(answer.proposal).toBeNull();
    expect(answer.sitePatchCard).toBeNull();
    expect(answer.answer.length).toBeGreaterThan(0);
  });
});

describe("circleUiActions", () => {
  function planWith(kinds: ActionKind[]): CapabilityPlan {
    return {
      viewerId: ALICE,
      targetObjectId: "obj-1",
      targetSchema: "ping.social.business@1",
      viewerIsOwner: true,
      actions: kinds.map((kind) => ({
        kind,
        label: kind,
        target: { kind: "object", objectId: "obj-1", schema: "ping.social.business@1" },
        reason: "test",
      })),
      capabilities: kinds,
    };
  }

  test("only planned actions render; like stays off identity cards", () => {
    const actions = circleUiActions(planWith(["follow", "like", "ask"]), "Ask FYD");
    expect(actions.map((a) => a.kind)).toEqual(["follow", "ask"]);
  });

  test("unknown future kinds are skipped, never rendered dead", () => {
    const plan = planWith(["follow"]);
    (plan.actions as { kind: string }[]).push({ kind: "mystery_kind" } as never);
    expect(circleUiActions(plan, "Ask FYD").map((a) => a.kind)).toEqual(["follow"]);
  });

  test("ask label flows through and site actions map", () => {
    const actions = circleUiActions(planWith(["ask", "propose_site_patch", "open_site"]), "Ask FYD");
    expect(actions).toHaveLength(3);
    expect(actions.find((a) => a.kind === "ask")).toMatchObject({ label: "Ask FYD" });
    expect(actions.find((a) => a.kind === "propose_site_patch")).toMatchObject({ label: "Propose site change" });
  });

  test("a null plan renders nothing", () => {
    expect(circleUiActions(null, "Ask FYD")).toEqual([]);
  });
});
