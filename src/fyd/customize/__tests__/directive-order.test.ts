/**
 * Journal-event order invariant for presentation-intent directives.
 *
 * Law under test: for the same section, the directive from the NEWEST
 * journal event wins. The emission layers (tools/fyd-site-projection/
 * dump.py and the ported applyTenantOverlays) must emit directives in
 * journal-event order: a re-approved intent moves to the END. The apply
 * layer consumes the list in order with last-wins, so emission order IS
 * the conflict resolution. The old in-place upsert let a re-approved
 * intent keep its old position and silently lose to a conflicting
 * intent whose journal event was older.
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs
 */

import { applyPresentationIntent } from "../apply-layer";
import { proposeFromSiteIntent } from "../propose";
import { applyTenantOverlays } from "../../data/fyd-tenant-graph";
import type { FydJournalOverlay } from "@/lib/ping/ping-object-reader";
import type {
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
} from "../types";

function obj(id: string, title: string): PingObject {
  return {
    id,
    schema: "ping.social.service@1",
    controllerId: "ctrl-1",
    visibility: "public",
    title,
    description: "",
    fields: {},
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    provenance: { ref: "test" } as unknown as PingObject["provenance"],
  };
}

function spec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "biz-1",
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "test",
      generatedAt: "2026-09-21T00:00:00Z",
    },
    themeTokens: { accent: "#000" } as unknown as FYDThemeTokens,
    navigation: [],
    pages: [
      {
        slug: "home",
        title: "Home",
        navLabel: "Home",
        sections: [
          {
            id: "home:Hero:0",
            component: "Hero",
            query: { kind: "owner" },
            presentation: {},
          },
          {
            id: "home:Services:1",
            component: "Services",
            query: { kind: "all", schema: "ping.social.service@1" },
            presentation: { heading: "Our services" },
          },
        ],
      },
    ],
  };
}

function graph(): ObjectGraph {
  return {
    objects: [
      obj("biz-1", "Test Business"),
      obj("svc-1", "Repairs"),
      obj("svc-2", "Painting"),
      obj("svc-3", "Drywall"),
    ],
    relationships: [],
  };
}

function makeDirective(
  intentId: string,
  objectIds: string[],
): PresentationIntentDirective {
  const outcome = proposeFromSiteIntent(spec(), {
    kind: "reorder_object",
    pageSlug: "home",
    sectionId: "home:Services:1",
    objectIds,
  });
  if (!outcome.ok) throw new Error("test setup failed: " + outcome.error);
  return {
    intentId,
    siteIntent: {
      kind: "reorder_object",
      pageSlug: "home",
      sectionId: "home:Services:1",
      objectIds,
    },
    proposal: outcome.proposal,
    approval: {
      proposalDigest: outcome.proposal.proposalDigest,
      approvedBy: "demo-owner (seeded, unverified)",
      approvedAt: "2026-09-21T00:00:00Z",
      note: "DEMO OWNER MODE - not real authentication. No identity was verified.",
    },
  };
}

function overlay(
  eventId: string,
  d: PresentationIntentDirective,
): FydJournalOverlay {
  return {
    eventId,
    timestamp: "2026-09-24T00:00:00Z",
    ops: [
      {
        op: "set_presentation_intent",
        intentId: d.intentId,
        siteIntent: d.siteIntent,
        proposal: d.proposal,
        approval: {
          proposalDigest: d.approval.proposalDigest,
          approvedBy: d.approval.approvedBy,
          approvedAt: d.approval.approvedAt,
          note: d.approval.note,
        },
      },
    ],
  };
}

function blockOf(directives: PresentationIntentDirective[]): PresentationIntentBlock {
  return {
    directives,
    provenance: {
      kind: "owner-presentation-intent",
      note: "test block",
      eventIds: directives.map((d) => d.approval.eventId ?? "?"),
    },
  };
}

describe("directive journal-event order", () => {
  test("a re-approved intent moves to the end of the emitted directive list", () => {
    // e1: Painting first. e2: Drywall first (conflicts with e1). e3: the
    // owner re-approves Painting-first; e3 is the newest journal event.
    const dA = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const dB = makeDirective("pi-B", ["svc-3", "svc-1", "svc-2"]);
    const dA2 = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const overlays = [overlay("e1", dA), overlay("e2", dB), overlay("e3", dA2)];
    const { directives } = applyTenantOverlays(graph(), overlays);
    // Upsert is by intentId (one directive per intent), but position is
    // journal-event order: the re-approved intent must NOT keep its old
    // (index 0) position. e1's pi-A is superseded by e3's re-approval,
    // which sits last so the newest journal event wins downstream.
    expect(directives.map((d) => d.intentId)).toEqual(["pi-B", "pi-A"]);
    expect(directives.map((d) => d.approval.eventId)).toEqual(["e2", "e3"]);
  });

  test("emission is deterministic: same journal gives the same order", () => {
    const dA = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const dB = makeDirective("pi-B", ["svc-3", "svc-1", "svc-2"]);
    const dA2 = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const overlays = () => [
      overlay("e1", dA),
      overlay("e2", dB),
      overlay("e3", dA2),
    ];
    const first = applyTenantOverlays(graph(), overlays()).directives;
    const second = applyTenantOverlays(graph(), overlays()).directives;
    expect(second.map((d) => d.approval.eventId)).toEqual(
      first.map((d) => d.approval.eventId),
    );
  });

  test("for the same section, the directive from the newest journal event wins", () => {
    const dA = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const dB = makeDirective("pi-B", ["svc-3", "svc-1", "svc-2"]);
    const dA2 = makeDirective("pi-A", ["svc-2", "svc-1", "svc-3"]);
    const overlays = [overlay("e1", dA), overlay("e2", dB), overlay("e3", dA2)];
    const { directives } = applyTenantOverlays(graph(), overlays);
    const result = applyPresentationIntent(
      spec(),
      blockOf(directives),
      graph(),
    );
    const services = result.spec.pages[0].sections.find(
      (s) => s.id === "home:Services:1",
    )!;
    // e3 (Painting first) is the newest journal event, so it wins over
    // the older e2 (Drywall first): emission order puts the re-approved
    // intent last and the apply layer consumes in order, last wins.
    expect(services.presentation.objectOrder).toEqual([
      "svc-2",
      "svc-1",
      "svc-3",
    ]);
    expect(result.applied.map((a) => a.intentId)).toEqual(["pi-B", "pi-A"]);
  });
});
