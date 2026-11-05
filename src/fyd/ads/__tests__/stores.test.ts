import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalizeJson } from "../../../lib/ping/dev-signer";
import { createHash } from "node:crypto";
import { DISCLOSURE_TEXT_VERSION } from "../disclosure";
import {
  AdsTenantScopeError,
  CorruptAdsLogError,
  readAdsEvents,
} from "../event-log";
import {
  activateCampaign,
  createCampaign,
  endCampaign,
  listCampaigns,
  pauseCampaign,
  projectCampaign,
  readCampaign,
  toSponsoredPlacement,
  type CampaignCreatedPayload,
} from "../campaign-store";
import {
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  BUDGET_WINDOW_MS,
} from "../policy";
import {
  declareSlot,
  grantConsent,
  listSlots,
  projectSlot,
  readSlot,
  retireSlot,
  revokeConsent,
} from "../inventory-store";

const PAYER = "ping-fyd";
const PUBLISHER = "loop-demo";
const SURFACE = "loop-demo";
const AT = "2026-11-04T19:00:00.000Z";

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fyd-ads-test-"));
  process.env.FYD_ADS_DIR = dir;
  return dir;
}

beforeEach(() => {
  freshDir();
});

afterEach(() => {
  delete process.env.FYD_ADS_DIR;
});

/**
 * The v1 house campaign, seeded through the store's own command path
 * (never a hand-written fixture file): ping-house-001, PING promoting
 * its own FYD object on the controlled loop-demo surface.
 */
function pingHouseCampaign(): CampaignCreatedPayload {
  return {
    campaignId: "ping-house-001",
    payerId: PAYER,
    sponsorDisplayName: "PING",
    objectId: "ping-fyd-object",
    disclosure: "Sponsored",
    reason: "Shown because this page opted in to PING placements.",
    targeting: { kind: "surface", sourceRef: SURFACE },
    surfaces: [SURFACE],
    startsAt: Date.UTC(2026, 10, 4),
    endsAt: Date.UTC(2026, 11, 4),
    docRef: "CAMPAIGN-PING-HOUSE-001.md",
    budgetScope: {
      impressionsCap: DAILY_IMPRESSIONS_CAP,
      clicksCap: DAILY_CLICKS_CAP,
      windowMs: BUDGET_WINDOW_MS,
    },
  };
}

function seedActiveCampaign() {
  createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT });
  return activateCampaign({ actorTenantId: PAYER, campaignId: "ping-house-001", at: AT });
}

function declareDemoSlot() {
  return declareSlot({
    actorTenantId: PUBLISHER,
    slot: {
      slotId: "loop-demo-portal",
      publisherTenantId: PUBLISHER,
      surface: SURFACE,
      slotKind: "portal-object",
      compositionCapacity: 8,
    },
    at: AT,
  });
}

function grantDemoConsent() {
  return grantConsent({
    actorTenantId: PUBLISHER,
    slotId: "loop-demo-portal",
    consent: {
      consentId: "consent-loop-demo-001",
      actorIdentityRef: "demo-owner:loop-demo",
      scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
      disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
      grantedAt: AT,
    },
    at: AT,
  });
}

describe("campaign store", () => {
  it("round-trips the seeded house campaign through its own append path", () => {
    const state = seedActiveCampaign();
    expect(state.status).toBe("active");
    expect(state.campaignId).toBe("ping-house-001");
    const read = readCampaign("ping-house-001", PAYER);
    expect(read).toEqual(state);
    const events = readAdsEvents("campaigns", "campaign", "ping-house-001");
    expect(events.map((e) => e.type)).toEqual(["campaign.created", "campaign.activated"]);
    expect(events[0].seq).toBe(0);
    expect(events[1].seq).toBe(1);
    expect(events[0].id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps the projection 1:1 onto SponsoredPlacement", () => {
    const state = seedActiveCampaign();
    const placement = toSponsoredPlacement(state, SURFACE);
    expect(placement).toEqual({
      placementId: "placement:ping-house-001:" + SURFACE,
      objectId: "ping-fyd-object",
      campaignId: "ping-house-001",
      payerId: PAYER,
      sponsorDisplayName: "PING",
      disclosure: "Sponsored",
      reason: "Shown because this page opted in to PING placements.",
      targeting: { kind: "surface", sourceRef: SURFACE },
      surface: SURFACE,
      campaignStatus: "active",
      startsAt: state.startsAt,
      endsAt: state.endsAt,
    });
  });

  it("projects a created (never activated) campaign as paused for placement", () => {
    createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT });
    const state = readCampaign("ping-house-001", PAYER);
    expect(state?.status).toBe("created");
    expect(toSponsoredPlacement(state!, SURFACE).campaignStatus).toBe("paused");
  });

  it("fails closed on illegal lifecycle transitions and duplicates", () => {
    expect(() =>
      activateCampaign({ actorTenantId: PAYER, campaignId: "nope-404", at: AT }),
    ).toThrow(/Unknown campaign/);
    createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT });
    expect(() =>
      createCampaign({ actorTenantId: PAYER, campaign: pingHouseCampaign(), at: AT }),
    ).toThrow(/already exists/);
    expect(() =>
      pauseCampaign({ actorTenantId: PAYER, campaignId: "ping-house-001", at: AT }),
    ).toThrow(/status created/);
    const ended = endCampaign({ actorTenantId: PAYER, campaignId: "ping-house-001", at: AT });
    expect(ended.status).toBe("ended");
    expect(() =>
      activateCampaign({ actorTenantId: PAYER, campaignId: "ping-house-001", at: AT }),
    ).toThrow(/status ended/);
  });

  it("fails closed on malformed campaign commands", () => {
    const bad = { ...pingHouseCampaign(), disclosure: "Ad" as never };
    expect(() => createCampaign({ actorTenantId: PAYER, campaign: bad, at: AT })).toThrow(
      /disclosure/,
    );
    const badWindow = { ...pingHouseCampaign(), endsAt: 0 };
    expect(() => createCampaign({ actorTenantId: PAYER, campaign: badWindow, at: AT })).toThrow(
      /window/,
    );
    expect(readCampaign("ping-house-001", PAYER)).toBeNull();
  });

  it("enforces tenant scope on commands and reads", () => {
    seedActiveCampaign();
    expect(() => readCampaign("ping-house-001", "other-tenant")).toThrow(AdsTenantScopeError);
    expect(() =>
      pauseCampaign({ actorTenantId: "other-tenant", campaignId: "ping-house-001", at: AT }),
    ).toThrow(AdsTenantScopeError);
    expect(() =>
      createCampaign({ actorTenantId: "other-tenant", campaign: pingHouseCampaign(), at: AT }),
    ).toThrow(AdsTenantScopeError);
    expect(listCampaigns(PAYER).map((c) => c.campaignId)).toEqual(["ping-house-001"]);
    expect(listCampaigns("other-tenant")).toEqual([]);
    expect(readCampaign("never-created", PAYER)).toBeNull();
  });

  it("rejects placement mapping for a surface the campaign does not name", () => {
    const state = seedActiveCampaign();
    expect(() => toSponsoredPlacement(state, "someone-else")).toThrow(/does not name surface/);
  });
});

describe("inventory + consent store", () => {
  it("round-trips declare -> grant -> revoke, consentActive follows the law", () => {
    const declared = declareDemoSlot();
    expect(declared.consentActive).toBe(false); // absent consent is inactive
    const granted = grantDemoConsent();
    expect(granted.consentActive).toBe(true);
    expect(granted.consent?.disclosureTextVersion).toBe(DISCLOSURE_TEXT_VERSION);
    const revoked = revokeConsent({
      actorTenantId: PUBLISHER,
      slotId: "loop-demo-portal",
      consentId: "consent-loop-demo-001",
      actorIdentityRef: "demo-owner:loop-demo",
      revokedAt: AT,
      at: AT,
    });
    expect(revoked.consentActive).toBe(false);
    expect(revoked.consent?.revokedAt).toBe(AT);
    expect(readSlot("loop-demo-portal", PUBLISHER)).toEqual(revoked);
  });

  it("a retired slot's consent is never active", () => {
    grantDemoConsentAfterDeclare();
    const retired = retireSlot({ actorTenantId: PUBLISHER, slotId: "loop-demo-portal", at: AT });
    expect(retired.retired).toBe(true);
    expect(retired.consentActive).toBe(false);
  });

  function grantDemoConsentAfterDeclare() {
    declareDemoSlot();
    grantDemoConsent();
  }

  it("fails closed on unpinned disclosure versions and non-covering scopes", () => {
    declareDemoSlot();
    expect(() =>
      grantConsent({
        actorTenantId: PUBLISHER,
        slotId: "loop-demo-portal",
        consent: {
          consentId: "consent-x",
          actorIdentityRef: "demo-owner:loop-demo",
          scope: { surfaces: [SURFACE], slotKinds: ["portal-object"] },
          disclosureTextVersion: "some-other-copy-v9",
          grantedAt: AT,
        },
        at: AT,
      }),
    ).toThrow(/disclosure text version/);
    expect(() =>
      grantConsent({
        actorTenantId: PUBLISHER,
        slotId: "loop-demo-portal",
        consent: {
          consentId: "consent-x",
          actorIdentityRef: "demo-owner:loop-demo",
          scope: { surfaces: ["a-different-surface"], slotKinds: ["portal-object"] },
          disclosureTextVersion: DISCLOSURE_TEXT_VERSION,
          grantedAt: AT,
        },
        at: AT,
      }),
    ).toThrow(/scope/);
    expect(readSlot("loop-demo-portal", PUBLISHER)?.consentActive).toBe(false);
  });

  it("fails closed on double grant and double revoke", () => {
    declareDemoSlot();
    grantDemoConsent();
    expect(() => grantDemoConsent()).toThrow(/active consent/);
    revokeConsent({
      actorTenantId: PUBLISHER,
      slotId: "loop-demo-portal",
      consentId: "consent-loop-demo-001",
      actorIdentityRef: "demo-owner:loop-demo",
      revokedAt: AT,
      at: AT,
    });
    expect(() =>
      revokeConsent({
        actorTenantId: PUBLISHER,
        slotId: "loop-demo-portal",
        consentId: "consent-loop-demo-001",
        actorIdentityRef: "demo-owner:loop-demo",
        revokedAt: AT,
        at: AT,
      }),
    ).toThrow(/already revoked/);
  });

  it("enforces tenant scope and lists only the publisher's slots", () => {
    declareDemoSlot();
    expect(() => readSlot("loop-demo-portal", "other-tenant")).toThrow(AdsTenantScopeError);
    expect(() =>
      retireSlot({ actorTenantId: "other-tenant", slotId: "loop-demo-portal", at: AT }),
    ).toThrow(AdsTenantScopeError);
    expect(listSlots(PUBLISHER).map((s) => s.slotId)).toEqual(["loop-demo-portal"]);
    expect(listSlots("other-tenant")).toEqual([]);
    expect(readSlot("never-declared", PUBLISHER)).toBeNull();
  });
});

describe("fail-closed reads", () => {
  it("missing logs read as empty, never as an error", () => {
    expect(readAdsEvents("campaigns", "campaign", "ghost-001")).toEqual([]);
    expect(readCampaign("ghost-001", PAYER)).toBeNull();
    expect(readSlot("ghost-001", PUBLISHER)).toBeNull();
    expect(listCampaigns(PAYER)).toEqual([]);
    expect(listSlots(PUBLISHER)).toEqual([]);
  });

  it("a corrupt log throws a typed error and its bytes are retained on append attempts", () => {
    declareDemoSlot();
    const path = join(process.env.FYD_ADS_DIR as string, "slots", "loop-demo-portal.json");
    writeFileSync(path, "{ not json", "utf8");
    expect(() => readSlot("loop-demo-portal", PUBLISHER)).toThrow(CorruptAdsLogError);
    expect(() =>
      retireSlot({ actorTenantId: PUBLISHER, slotId: "loop-demo-portal", at: AT }),
    ).toThrow(CorruptAdsLogError);
    expect(readFileSync(path, "utf8")).toBe("{ not json");
  });

  it("a structurally invalid log that claims the shape throws, not []", () => {
    const dir = process.env.FYD_ADS_DIR as string;
    mkdirSync(join(dir, "campaigns"), { recursive: true });
    const path = join(dir, "campaigns", "ping-house-001.json");
    writeFileSync(path, JSON.stringify({ version: 1, entityKind: "campaign", entityId: "ping-house-001", events: [{ bogus: true }] }) + "\n", "utf8");
    expect(() => readCampaign("ping-house-001", PAYER)).toThrow(CorruptAdsLogError);
  });
});

describe("determinism", () => {
  it("the same log projects identically twice", () => {
    seedActiveCampaign();
    declareDemoSlot();
    grantDemoConsent();
    const c1 = projectCampaign(readAdsEvents("campaigns", "campaign", "ping-house-001"));
    const c2 = projectCampaign(readAdsEvents("campaigns", "campaign", "ping-house-001"));
    expect(c2).toEqual(c1);
    const digest = (v: unknown) => createHash("sha256").update(canonicalizeJson(v), "utf8").digest("hex");
    expect(digest(c2)).toBe(digest(c1));
    const s1 = projectSlot(readAdsEvents("slots", "slot", "loop-demo-portal"));
    const s2 = projectSlot(readAdsEvents("slots", "slot", "loop-demo-portal"));
    expect(s2).toEqual(s1);
    expect(digest(s2)).toBe(digest(s1));
  });

  it("identical commands at identical times produce identical event ids in a fresh log", () => {
    const first = (() => {
      seedActiveCampaign();
      return readAdsEvents("campaigns", "campaign", "ping-house-001").map((e) => e.id);
    })();
    freshDir();
    seedActiveCampaign();
    const second = readAdsEvents("campaigns", "campaign", "ping-house-001").map((e) => e.id);
    expect(second).toEqual(first);
  });
});
