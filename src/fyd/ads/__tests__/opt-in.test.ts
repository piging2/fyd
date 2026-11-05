/**
 * B5 opt-in flow tests: the publisher opt-in page's API route, the
 * opt-in module's store-projected readback, and the client controls'
 * first render.
 *
 * Law under test (DESIGN.md component F and security section):
 * - Grant flows end to end through the route into the REAL B1 store:
 *   the slot log gains slot.declared and consent.granted pinning the
 *   current disclosure version, and the projection shows consent
 *   active.
 * - A grant naming any other disclosure version fails closed BEFORE
 *   any write (no slot log exists afterwards).
 * - Revoke appends consent.revoked, the projection goes inactive,
 *   and the B3 matching provider, evaluated against the same store
 *   state, returns no placement for the slot: revocation stops
 *   delivery, proven at the provider level.
 * - Identity is server-side only: a body asserting its own
 *   publisher is rejected as an unknown field and writes nothing; a
 *   session bound to a different tenant is refused (403); no
 *   session is a 401. The body never decides who is acting.
 * - The flag gates the route: off -> 404 for GET and POST, nothing
 *   written.
 * - Readback is the store projection: GET (and readOptInState)
 *   reflect grant and revoke exactly, including the disclosure
 *   version the consent pins.
 */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import {
  createAdsOptInGetHandler,
  createAdsOptInPostHandler,
  type AdsOptInRouteDeps,
} from "../opt-in-route";
import {
  createSessionValue,
  SESSION_COOKIE_NAME,
} from "../../identity/session";
import {
  explainCandidateRank,
  type RankedCandidate,
} from "../../rank/object-ranker";
import {
  activateCampaign,
  createCampaign,
  type CampaignCreatedPayload,
} from "../campaign-store";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import {
  declareSlot,
  listSlots,
  readSlot,
} from "../inventory-store";
import { OptInControls } from "../opt-in-client";
import { readOptInState, slotReadback } from "../opt-in";
import {
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  LOOP_PUBLISHER_TENANT_ID,
  LOOP_SURFACE,
} from "../policy";
import { evaluateComposition } from "../provider";

const PAYER = "ping-fyd";
const PUBLISHER = LOOP_PUBLISHER_TENANT_ID;
const SURFACE = LOOP_SURFACE;
const OBJECT_ID = "ping-fyd-business";
const SLOT_ID = "slot-loop-demo-main";
const CAMPAIGN_ID = "ping-house-001";
const CONSENT_ID = "consent-1";
const VIEWER = "viewer-scope-1";
const SECRET = "b5-test-session-secret-0123456789abcdef";
const PUBLISHER_IDENTITY = "11111111-2222-4333-8444-555555555555";
const OTHER_IDENTITY = "99999999-8888-4777-8666-555555555555";
const FLAG_ON = { FYD_ADS_LOOP_ENABLED: "1" } as const;

let adsDir = "";

beforeEach(() => {
  adsDir = mkdtempSync(join(tmpdir(), "fyd-ads-b5-test-"));
  process.env.FYD_ADS_DIR = adsDir;
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
});

const deps: AdsOptInRouteDeps = {
  env: { ...FLAG_ON, FYD_SESSION_SECRET: SECRET },
  resolveTenantIdForIdentity: (identityId) =>
    identityId === PUBLISHER_IDENTITY
      ? PUBLISHER
      : identityId === OTHER_IDENTITY
        ? "other-tenant"
        : null,
};

function cookieFor(identityId: string): string {
  return SESSION_COOKIE_NAME + "=" + createSessionValue(identityId, SECRET);
}

function requestFor(
  method: "GET" | "POST",
  body: unknown,
  cookie?: string,
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/fyd/ads/opt-in", {
    method,
    headers,
    body:
      method === "POST"
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
}

function grantBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    action: "grant",
    slotId: SLOT_ID,
    surface: SURFACE,
    slotKind: "portal-object",
    compositionCapacity: 12,
    disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
    consentId: CONSENT_ID,
    ...overrides,
  };
}

function slotLogText(): string {
  return readFileSync(join(adsDir, "slots", SLOT_ID + ".json"), "utf8");
}

describe("grant flow", () => {
  it("grants end to end: slot.declared and consent.granted land in the store log, projection active", async () => {
    const post = createAdsOptInPostHandler(deps);
    const res = await post(
      requestFor("POST", grantBody(), cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.slot.consentStatus).toBe("active");
    expect(json.slot.disclosureTextVersion).toBe(DISCLOSURE_TEXT_VERSION);

    // The raw slot log carries both events, the grant pinning the
    // version the page showed.
    const log = slotLogText();
    expect(log).toContain('"slot.declared"');
    expect(log).toContain('"consent.granted"');
    expect(log).toContain(DISCLOSURE_TEXT_VERSION);

    const state = readSlot(SLOT_ID, PUBLISHER);
    expect(state).not.toBeNull();
    expect(state?.consentActive).toBe(true);
    expect(state?.consent?.consentId).toBe(CONSENT_ID);
    expect(state?.consent?.disclosureTextVersion).toBe(
      DISCLOSURE_TEXT_VERSION,
    );
    expect(state?.consent?.scope.surfaces).toEqual([SURFACE]);
    expect(state?.consent?.scope.slotKinds).toEqual(["portal-object"]);
  });

  it("rejects a grant naming a non-pinned disclosure version and writes nothing", async () => {
    const post = createAdsOptInPostHandler(deps);
    const res = await post(
      requestFor(
        "POST",
        grantBody({ disclosureTextVersion: "loop-disclosure-v0" }),
        cookieFor(PUBLISHER_IDENTITY),
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("opt-in-rejected");
    // Fail-closed BEFORE any write: no slot log, no projection.
    expect(existsSync(join(adsDir, "slots", SLOT_ID + ".json"))).toBe(false);
    expect(listSlots(PUBLISHER)).toEqual([]);
  });
});

describe("revoke stops delivery", () => {
  function seedActiveCampaign(): void {
    const now = Date.now();
    const payload: CampaignCreatedPayload = {
      campaignId: CAMPAIGN_ID,
      payerId: PAYER,
      sponsorDisplayName: "PING",
      objectId: OBJECT_ID,
      disclosure: "Sponsored",
      reason: "Shown because this page opted in to PING placements.",
      targeting: { kind: "surface", sourceRef: SURFACE },
      surfaces: [SURFACE],
      startsAt: now - 24 * 60 * 60 * 1000,
      endsAt: now + 30 * 24 * 60 * 60 * 1000,
      docRef: "CAMPAIGN-PING-HOUSE-001.md",
      budgetScope: {
        impressionsCap: DAILY_IMPRESSIONS_CAP,
        clicksCap: DAILY_CLICKS_CAP,
        windowMs: BUDGET_WINDOW_MS,
      },
    };
    createCampaign({ actorTenantId: PAYER, campaign: payload });
    activateCampaign({ actorTenantId: PAYER, campaignId: CAMPAIGN_ID });
  }

  function candidate(objectId: string): RankedCandidate {
    return explainCandidateRank(
      {
        objectId,
        semanticProximity: 0.9,
        semanticTargetPresent: true,
        followed: false,
        liked: false,
        capabilityCount: 3,
        recentInteractionAt: null,
        slotStability: 1,
        slotCollisionRisk: 0,
      },
      Date.now(),
    );
  }

  function compose() {
    return evaluateComposition({
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      viewerScopeRef: VIEWER,
      candidates: [
        candidate("org-1"),
        candidate("org-2"),
        candidate("org-3"),
        candidate(OBJECT_ID),
      ],
      limit: 12,
    });
  }

  it("provider delivers with consent, and returns no placement after the route revokes it", async () => {
    seedActiveCampaign();
    const post = createAdsOptInPostHandler(deps);
    const cookie = cookieFor(PUBLISHER_IDENTITY);
    const grantRes = await post(requestFor("POST", grantBody(), cookie));
    expect(grantRes.status).toBe(200);

    const delivered = compose();
    expect(delivered.sponsored).not.toBeNull();

    const revokeRes = await post(
      requestFor(
        "POST",
        { action: "revoke", slotId: SLOT_ID, consentId: CONSENT_ID },
        cookie,
      ),
    );
    expect(revokeRes.status).toBe(200);
    const revokeJson = await revokeRes.json();
    expect(revokeJson.slot.consentStatus).toBe("revoked");

    const log = slotLogText();
    expect(log).toContain('"consent.revoked"');
    expect(readSlot(SLOT_ID, PUBLISHER)?.consentActive).toBe(false);

    // The provider reads projections per request: no placement now.
    const after = compose();
    expect(after.sponsored).toBeNull();
  });

  it("rejects revoking a consent that is not current", async () => {
    const post = createAdsOptInPostHandler(deps);
    const cookie = cookieFor(PUBLISHER_IDENTITY);
    await post(requestFor("POST", grantBody(), cookie));
    const res = await post(
      requestFor(
        "POST",
        { action: "revoke", slotId: SLOT_ID, consentId: "consent-nope" },
        cookie,
      ),
    );
    expect(res.status).toBe(400);
    expect(readSlot(SLOT_ID, PUBLISHER)?.consentActive).toBe(true);
  });
});

describe("identity is server-side only", () => {
  it("rejects a body asserting its own publisher tenancy and writes nothing", async () => {
    const post = createAdsOptInPostHandler(deps);
    const res = await post(
      requestFor(
        "POST",
        grantBody({ publisherTenantId: PUBLISHER }),
        cookieFor(PUBLISHER_IDENTITY),
      ),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("invalid-opt-in-request");
    expect(listSlots(PUBLISHER)).toEqual([]);
  });

  it("refuses a session bound to a different tenant (403), for POST and GET", async () => {
    const post = createAdsOptInPostHandler(deps);
    const res = await post(
      requestFor("POST", grantBody(), cookieFor(OTHER_IDENTITY)),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("not-loop-publisher");
    expect(listSlots("other-tenant")).toEqual([]);
    expect(listSlots(PUBLISHER)).toEqual([]);

    const get = createAdsOptInGetHandler(deps);
    const getRes = await get(
      requestFor("GET", undefined, cookieFor(OTHER_IDENTITY)),
    );
    expect(getRes.status).toBe(403);
  });

  it("answers 401 without a session, for POST and GET", async () => {
    const post = createAdsOptInPostHandler(deps);
    const res = await post(requestFor("POST", grantBody()));
    expect(res.status).toBe(401);
    expect(listSlots(PUBLISHER)).toEqual([]);

    const get = createAdsOptInGetHandler(deps);
    const getRes = await get(requestFor("GET", undefined));
    expect(getRes.status).toBe(401);
  });
});

describe("flag gate", () => {
  it("answers 404 for POST and GET when the loop is disabled and writes nothing", async () => {
    const offDeps: AdsOptInRouteDeps = {
      env: { FYD_SESSION_SECRET: SECRET },
      resolveTenantIdForIdentity: deps.resolveTenantIdForIdentity,
    };
    const post = createAdsOptInPostHandler(offDeps);
    const res = await post(
      requestFor("POST", grantBody(), cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ads-loop-disabled");
    expect(listSlots(PUBLISHER)).toEqual([]);

    const get = createAdsOptInGetHandler(offDeps);
    const getRes = await get(
      requestFor("GET", undefined, cookieFor(PUBLISHER_IDENTITY)),
    );
    expect(getRes.status).toBe(404);
  });
});

describe("readback accuracy", () => {
  it("GET reflects the store projection before grant, after grant, and after revoke", async () => {
    const post = createAdsOptInPostHandler(deps);
    const get = createAdsOptInGetHandler(deps);
    const cookie = cookieFor(PUBLISHER_IDENTITY);

    const before = await get(requestFor("GET", undefined, cookie));
    expect(before.status).toBe(200);
    const beforeJson = await before.json();
    expect(beforeJson.state.publisherTenantId).toBe(PUBLISHER);
    expect(beforeJson.state.disclosureTextVersion).toBe(
      DISCLOSURE_TEXT_VERSION,
    );
    expect(beforeJson.state.slots).toEqual([]);

    await post(requestFor("POST", grantBody(), cookie));
    const granted = await get(requestFor("GET", undefined, cookie));
    const grantedJson = await granted.json();
    expect(grantedJson.state.slots).toHaveLength(1);
    expect(grantedJson.state.slots[0]).toMatchObject({
      slotId: SLOT_ID,
      surface: SURFACE,
      slotKind: "portal-object",
      consentStatus: "active",
      consentId: CONSENT_ID,
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      revokedAt: null,
    });

    await post(
      requestFor(
        "POST",
        { action: "revoke", slotId: SLOT_ID, consentId: CONSENT_ID },
        cookie,
      ),
    );
    const revoked = await get(requestFor("GET", undefined, cookie));
    const revokedJson = await revoked.json();
    expect(revokedJson.state.slots[0].consentStatus).toBe("revoked");
    expect(revokedJson.state.slots[0].revokedAt).not.toBeNull();
    expect(revokedJson.state.slots[0].disclosureTextVersion).toBe(
      DISCLOSURE_TEXT_VERSION,
    );
  });

  it("readOptInState reports never-granted for a declared slot without consent", () => {
    declareSlot({
      actorTenantId: PUBLISHER,
      slot: {
        slotId: SLOT_ID,
        publisherTenantId: PUBLISHER,
        surface: SURFACE,
        slotKind: "portal-object",
        compositionCapacity: 12,
      },
    });
    const state = readOptInState(PUBLISHER);
    expect(state.slots).toHaveLength(1);
    expect(state.slots[0].consentStatus).toBe("never-granted");
    expect(state.slots[0].consentId).toBeNull();
    const raw = readSlot(SLOT_ID, PUBLISHER);
    expect(raw).not.toBeNull();
    expect(slotReadback(raw as NonNullable<typeof raw>).consentStatus).toBe(
      "never-granted",
    );
  });
});

describe("malformed bodies", () => {
  it("rejects bad JSON, unknown slot kinds, non-positive capacity, and unknown actions, writing nothing", async () => {
    const post = createAdsOptInPostHandler(deps);
    const cookie = cookieFor(PUBLISHER_IDENTITY);
    const badJson = await post(requestFor("POST", "{not json", cookie));
    expect(badJson.status).toBe(400);
    const badKind = await post(
      requestFor("POST", grantBody({ slotKind: "banner" }), cookie),
    );
    expect(badKind.status).toBe(400);
    const badCapacity = await post(
      requestFor("POST", grantBody({ compositionCapacity: 0 }), cookie),
    );
    expect(badCapacity.status).toBe(400);
    const badAction = await post(
      requestFor("POST", { action: "explode", slotId: SLOT_ID }, cookie),
    );
    expect(badAction.status).toBe(400);
    expect(listSlots(PUBLISHER)).toEqual([]);
  });
});

describe("opt-in controls first render", () => {
  it("renders the grant form pinned to the disclosure version and a revoke action per active consent", () => {
    const html = renderToString(
      React.createElement(OptInControls, {
        disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
        defaultSurface: SURFACE,
        defaultSlotId: SLOT_ID,
        slots: [
          {
            slotId: SLOT_ID,
            surface: SURFACE,
            slotKind: "portal-object" as const,
            compositionCapacity: 12,
            retired: false,
            consentStatus: "active" as const,
            consentId: CONSENT_ID,
            disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
            grantedAt: "2026-11-04T19:00:00.000Z",
            revokedAt: null,
          },
        ],
      }),
    );
    expect(html).toContain(DISCLOSURE_TEXT_VERSION);
    // SSR inserts comment markers between text and expressions, so
    // the button label is asserted as its two rendered parts.
    expect(html).toContain("Revoke consent for");
    expect(html).toContain(SLOT_ID);
  });

  it("renders no revoke action when no consent is active", () => {
    const html = renderToString(
      React.createElement(OptInControls, {
        disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
        defaultSurface: SURFACE,
        defaultSlotId: SLOT_ID,
        slots: [],
      }),
    );
    expect(html).not.toContain("Revoke consent for");
    expect(html).toContain("Grant consent under disclosure");
  });
});
