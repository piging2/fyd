/**
 * INV-08: unknown capability -> no action button.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/object/view.ts        buildCapabilities (data seam: schema decides
 *                                 the actions; unknown role -> ask only)
 *   src/app/o/[objectId]/page.tsx ActionButtons render switch
 *                                 (render seam: default -> null)
 *
 * The law: a capability exists only when the schema grants it AND the
 * underlying value exists. No fake buttons, no dead boxes, and no
 * rendering for capability kinds the UI does not know.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { buildCapabilities } from "../../object/view";
import type { ObjectContactView } from "../../object/types";

const KNOWN_KINDS = new Set([
  "view",
  "ask",
  "follow",
  "like",
  "call",
  "email",
  "website",
  "directions",
  "reference",
]);

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

const NO_EVIDENCE = { summary: "", services: [] };

describe("INV-08 unknown capability -> no action button (data seam)", () => {
  test("unknown schema role: ask-only when evidence-gated, never contact buttons", () => {
    const caps = buildCapabilities(
      "fyd:totally-unknown-schema",
      "u-1",
      contactOf({ phone: "(970) 555-0100" }),
      NO_EVIDENCE,
    );
    for (const c of caps) expect(KNOWN_KINDS.has(c.kind)).toBe(true);
    // Contact values exist but the role grants no contact actions: no buttons.
    expect(
      caps.some(
        (c) => c.kind === "call" || c.kind === "email" || c.kind === "website",
      ),
    ).toBe(false);
  });

  test("business without contact values: no dead buttons", () => {
    const caps = buildCapabilities(
      "ping.social.business@1",
      "b-1",
      contactOf({}),
      NO_EVIDENCE,
    );
    // G4: the authority grants "reference" in the base set, so it
    // propagates. follow is the business schema's unconditional action;
    // ask needs evidence; call/email/website need values. Nothing else
    // renders: no dead buttons.
    expect(caps.map((c) => c.kind)).toEqual(["reference", "follow"]);
  });

  test("business with phone only: call appears, email/website do not", () => {
    const caps = buildCapabilities(
      "ping.social.business@1",
      "b-2",
      contactOf({ phone: "(970) 555-0100" }),
      NO_EVIDENCE,
    );
    const kinds = caps.map((c) => c.kind);
    expect(kinds).toContain("call");
    expect(kinds).not.toContain("email");
    expect(kinds).not.toContain("website");
    const call = caps.find((c) => c.kind === "call");
    expect(call).toMatchObject({ href: "tel:(970)555-0100", label: "Call" });
  });

  test("location with locality: directions is maps-gated, not free-form", () => {
    const caps = buildCapabilities(
      "ping.social.location@1",
      "l-1",
      contactOf({ locality: "Grand Junction, CO" }),
      NO_EVIDENCE,
    );
    const directions = caps.find((c) => c.kind === "directions");
    expect(directions).toBeDefined();
    if (directions && directions.kind === "directions") {
      expect(directions.href).toBe(
        "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent("Grand Junction, CO"),
      );
    }
  });

  test("every emitted kind is in the closed known set (battery)", () => {
    const schemas = [
      "ping.social.business@1",
      "ping.social.service@1",
      "ping.social.product@1",
      "ping.social.location@1",
      "ping.social.person@1",
      "ping.social.post@1",
      "ping.social.article@1",
      "fyd:unknown-role",
    ];
    const full = contactOf({
      phone: "(970) 555-0100",
      email: "shop@example.com",
      website: "https://example.com",
      locality: "Grand Junction, CO",
    });
    for (const schema of schemas) {
      const caps = buildCapabilities(schema, "x", full, {
        summary: "Evidence-backed summary.",
        services: [],
      });
      for (const c of caps) {
        expect(KNOWN_KINDS.has(c.kind)).toBe(true);
      }
    }
  });
});

describe("INV-08 unknown capability -> no action button (render seam)", () => {
  jest.mock("@/fyd/object/by-id", () => {
    const { hostileObjectView } = require("./hostile-view");
    return {
      loadObjectViewBySlugOrId: () => ({
        view: hostileObjectView(),
        siteId: "test-site",
      }),
    };
  });
  jest.mock("next/link", () => ({ __esModule: true, default: () => null }));
  jest.mock("next/navigation", () => ({
    notFound: () => {
      throw new Error("notFound");
    },
  }));
  jest.mock("lucide-react", () => ({
    __esModule: true,
    ExternalLink: () => null,
    Mail: () => null,
    MapPin: () => null,
    MessageCircleQuestion: () => null,
    Phone: () => null,
  }));
  jest.mock("@/fyd/ui/ask-object-panel", () => ({
    __esModule: true,
    AskObjectPanel: () => null,
  }));
  jest.mock("@/fyd/ui/reference-button", () => ({
    __esModule: true,
    ReferenceButton: () => null,
  }));
  jest.mock("@/fyd/ui/follow-button", () => ({
    __esModule: true,
    FollowButton: () => null,
  }));
  jest.mock("@/fyd/ui/like-button", () => ({
    __esModule: true,
    LikeButton: () => null,
  }));
  jest.mock("@/fyd/ui/why-this", () => ({
    __esModule: true,
    WhyThis: () => null,
  }));

  test("the real /o render switch renders nothing for an unknown kind", async () => {
    const mod = await import("@/app/o/[objectId]/page");
    const el = await mod.default({
      params: Promise.resolve({ objectId: "hostile-biz" }),
    });
    const html = renderToStaticMarkup(el as any);
    // The known call capability renders as an action...
    expect(html).toContain("Call");
    expect(html).toContain("tel:+19705550100");
    // ...the unknown "purchase" capability renders nothing: no label,
    // no hostile href, no button element for it.
    expect(html).not.toContain("Buy now");
    expect(html).not.toContain("evil.example");
  });
});
