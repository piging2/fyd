/**
 * G4 capability propagation proof.
 *
 * OBJECT + VIEWER + CONTEXT -> CAPABILITY RESOLUTION -> AVAILABLE ACTIONS
 * -> RENDER MODEL -> COMPONENT.
 *
 * Proves against the real Coppersmith Plumbing projection fixture
 * (digest-verified PING dump bytes):
 *  1. The allowed action set comes from the capability authority
 *     (capabilityOptionsForSchema), not from view-layer role logic.
 *  2. buildCapabilities is a mechanical mapping of the authority's
 *     answer plus executability gates (evidence, safe links).
 *  3. The Coppersmith business object resolves exactly: Ask FYD,
 *     Reference, Follow, Website, Call, Directions.
 *  4. Different viewer/context inputs produce the authorized action set.
 *  5. The ObjectAffordance preview derives its links from the authority.
 *
 * Run from the repo root so media manifests resolve via process.cwd().
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capabilityOptionsForSchema } from "../../sitespec/schemas";
import type { FYDActionKind } from "../../sitespec/schemas";
import { buildCapabilities } from "../view";
import { loadObjectView } from "../view";
import type { ObjectCapability } from "../types";
import type { ObjectContactView } from "../types";

const PROJECTIONS = join(__dirname, "fixtures", "projections");

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-g4-test-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

/** Render-model kind -> the authority kind that must have allowed it. */
const CAP_TO_AUTHORITY: Record<ObjectCapability["kind"], FYDActionKind> = {
  ask: "ask",
  reference: "reference",
  follow: "follow",
  like: "like",
  website: "open_website",
  call: "call",
  email: "email",
  directions: "directions",
};

function contactOf(partial: Partial<ObjectContactView>): ObjectContactView {
  return {
    phone: null,
    email: null,
    website: null,
    locality: null,
    addressVisibility: "public",
    ...partial,
  };
}

const EVIDENCE = { summary: "A real business.", services: [] };
const NO_EVIDENCE = { summary: "", services: [] };

describe("G4 capability propagation", () => {
  test("coppersmith business resolves the full allowed action set end to end", () => {
    const view = loadObjectView("coppersmith-plumbing");
    expect(view).not.toBeNull();
    const kinds = view!.capabilities.map((c) => c.kind);
    // Authority order: ask, reference, follow, website, call, directions.
    // "open" is demoted by standing binding; everything else the
    // authority allows is present because evidence and values exist.
    expect(kinds).toEqual([
      "ask",
      "reference",
      "follow",
      "website",
      "call",
      "directions",
    ]);
    const call = view!.capabilities.find((c) => c.kind === "call");
    expect(call).toMatchObject({ href: "tel:970-245-3869", label: "Call" });
    const website = view!.capabilities.find((c) => c.kind === "website");
    expect(website).toMatchObject({
      href: "https://coppersmithplumbing.com/",
      label: "Website",
    });
    const directions = view!.capabilities.find((c) => c.kind === "directions");
    expect((directions as { href: string }).href).toContain("google.com/maps");
  });

  test("the authority (not the view layer) decides the allowed set", () => {
    const allowed = capabilityOptionsForSchema("ping.social.business@1", {
      viewerId: null,
      controllerId: "identity_fyd_compiler_test",
      hasWebsite: true,
      hasPhone: true,
      hasEmail: false,
      hasLocality: true,
    });
    expect(allowed).toEqual([
      "open",
      "ask",
      "reference",
      "follow",
      "open_website",
      "call",
      "directions",
    ]);
  });

  test("every rendered capability was allowed by the authority (all roles)", () => {
    // The chain property: no capability reaches the render model unless
    // the authority granted its kind. This is what "no component-local
    // business rules" means mechanically.
    const schemas = [
      "ping.social.business@1",
      "ping.social.service@1",
      "ping.social.post@1",
      "ping.social.person@1",
      "ping.social.location@1",
      "ping.social.product@1",
      "ping.social.article@1",
      "ping.social.website@1",
      "fyd:totally-unknown-schema",
    ];
    const contact = contactOf({
      phone: "970-555-0100",
      email: "shop@example.com",
      website: "https://example.com",
      locality: "Grand Junction, CO",
    });
    for (const schemaId of schemas) {
      const allowed = capabilityOptionsForSchema(schemaId, {
        viewerId: null,
        controllerId: "ctrl",
        hasWebsite: true,
        hasPhone: true,
        hasEmail: true,
        hasLocality: true,
      });
      const caps = buildCapabilities(schemaId, "o1", contact, EVIDENCE);
      for (const cap of caps) {
        expect(allowed).toContain(CAP_TO_AUTHORITY[cap.kind]);
      }
    }
  });

  test("unknown schemas stay minimal: no contact actions (INV-08)", () => {
    const caps = buildCapabilities(
      "fyd:totally-unknown-schema",
      "u1",
      contactOf({ phone: "970-555-0100", website: "https://example.com" }),
      EVIDENCE,
    );
    const kinds = caps.map((c) => c.kind);
    expect(kinds).not.toContain("call");
    expect(kinds).not.toContain("email");
    expect(kinds).not.toContain("website");
    expect(kinds).not.toContain("directions");
  });

  test("viewer changes the authorized set: owner is allowed propose_update", () => {
    const anon = capabilityOptionsForSchema("ping.social.business@1", {
      viewerId: null,
      controllerId: "ctrl",
      hasWebsite: false,
    });
    expect(anon).not.toContain("propose_update");
    const owner = capabilityOptionsForSchema("ping.social.business@1", {
      viewerId: "ctrl",
      controllerId: "ctrl",
      hasWebsite: false,
    });
    expect(owner).toContain("propose_update");
    expect(owner).toContain("site_propose");
    // Allowed by the authority, but the customer render model has no
    // owner-action buttons: allowed, not rendered.
    const caps = buildCapabilities("ping.social.business@1", "b1", contactOf({}), NO_EVIDENCE, {
      viewerId: "ctrl",
      controllerId: "ctrl",
    });
    expect(caps.map((c) => c.kind)).toEqual(["reference", "follow"]);
  });

  test("signed-in viewer on a post is allowed reply; it is not rendered (no backend)", () => {
    const allowed = capabilityOptionsForSchema("ping.social.post@1", {
      viewerId: "v1",
      controllerId: "ctrl",
      hasWebsite: false,
    });
    expect(allowed).toContain("reply");
    const caps = buildCapabilities("ping.social.post@1", "p1", contactOf({}), EVIDENCE, {
      viewerId: "v1",
      controllerId: "ctrl",
    });
    expect(caps.some((c) => c.kind === "reply")).toBe(false);
    // like still propagates for posts.
    expect(caps.some((c) => c.kind === "like")).toBe(true);
  });

  test("context gates contact actions: no value, no button", () => {
    const caps = buildCapabilities(
      "ping.social.business@1",
      "b1",
      contactOf({}),
      EVIDENCE,
    );
    const kinds = caps.map((c) => c.kind);
    expect(kinds).toEqual(["ask", "reference", "follow"]);
  });

  test("hostile website value emits no website capability (safe-link gate holds)", () => {
    const caps = buildCapabilities(
      "ping.social.business@1",
      "b1",
      contactOf({ website: "javascript:alert('xss-test')" }),
      EVIDENCE,
    );
    expect(caps.some((c) => c.kind === "website")).toBe(false);
  });

  test("affordance-eligible roles always resolve ask+open from the authority", () => {
    // The ObjectAffordance preview renders Ask FYD from "ask" and View
    // details from "open". Both are in the authority's base set for
    // every role, so the component derives rather than decides.
    for (const schemaId of [
      "ping.social.service@1",
      "ping.social.product@1",
      "ping.social.person@1",
      "ping.social.location@1",
    ]) {
      const allowed = capabilityOptionsForSchema(schemaId, {
        viewerId: null,
        controllerId: "ctrl",
        hasWebsite: false,
      });
      expect(allowed).toContain("ask");
      expect(allowed).toContain("open");
    }
  });

  test("business keeps follow; service keeps like; neither crosses", () => {
    const business = capabilityOptionsForSchema("ping.social.business@1", {
      viewerId: null,
      controllerId: "ctrl",
      hasWebsite: false,
    });
    expect(business).toContain("follow");
    expect(business).not.toContain("like");
    const service = capabilityOptionsForSchema("ping.social.service@1", {
      viewerId: null,
      controllerId: "ctrl",
      hasWebsite: false,
    });
    expect(service).toContain("like");
    expect(service).not.toContain("follow");
  });
});
