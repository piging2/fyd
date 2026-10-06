/**
 * PROD-8: an orphaned correction produces a visible warning in the
 * owner UI (/dev/objects lab).
 *
 * Rendered output assertions on the real lab client
 * (ObjectsLabClient) via renderToStaticMarkup in the node test
 * environment: with an orphaned correction present, the owner-facing
 * warning text is in the markup; with none, it is absent.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObjectsLabClient } from "../objects-lab-client";
import type { LabMeta } from "../objects-lab-client";
import type { LabTypeGroup } from "../lab-adapter";
import type { OrphanedCorrection } from "@/fyd/object/owner-overlay";
import type { ObjectView } from "@/fyd/object/types";

const META: LabMeta = {
  dumpedAt: "2026-09-27T00:00:00Z",
  dumperVersion: "test",
  graphDigest: "abc123",
  generatedAt: "2026-09-27T00:00:00Z",
  objectCount: 1,
  relationshipCount: 0,
};

const VIEW: ObjectView = {
  id: "happy-place",
  schema: "ping.social.business@1",
  name: "Happy Place",
  category: "Carpentry",
  locationLabel: "Grand Junction, CO",
  summary: "A demo business.",
  media: [],
  services: [],
  serviceArea: [],
  contact: {
    phone: null,
    email: null,
    website: null,
    locality: "Grand Junction, CO",
    addressVisibility: "public",
    addressVisibilityPreference: "default",
  },
  capabilities: [],
  provenance: {
    kind: "website-derived",
    ref: "website-ingestion:test",
    derivedAt: "2026-09-27T00:00:00Z",
    label: "Information from the business website",
  },
  ownerUpdatedAt: "2026-09-21T21:16:48.508Z",
  fieldCorrections: [],
  sampleQuestions: [],
};

const GROUPS: LabTypeGroup[] = [
  {
    type: "Business",
    objects: [
      {
        id: "happy-place",
        schema: "ping.social.business@1",
        title: "Happy Place",
        visibility: "public",
        provenanceKind: "website-derived",
        provenanceRef: "website-ingestion:test",
        derivedAt: "2026-09-27T00:00:00Z",
        description: null,
      },
    ],
  },
];

const ORPHAN: OrphanedCorrection = {
  correction: null,
  target: "services:order",
  reason: "service-order-orphaned",
  detail:
    "This correction does not apply to anything. It may reference a deleted or renamed item. " +
    "The service order correction names 5 service(s) (svc-decks, svc-fences, svc-pergolas, svc-bathrooms, svc-custom-work), " +
    "none of which exist in the current site data.",
};

function render(orphanedCorrections: OrphanedCorrection[]): string {
  return renderToStaticMarkup(
    <ObjectsLabClient
      siteIds={["happy-place"]}
      siteId="happy-place"
      meta={META}
      typeGroups={GROUPS}
      views={{ "happy-place": VIEW }}
      orphanedCorrections={orphanedCorrections}
      demoOwnerModeEnabled={false}
    />,
  );
}

describe("PROD-8: /dev/objects orphaned-correction warning", () => {
  test("orphaned correction renders a visible warning with the owner-facing text", () => {
    const html = render([ORPHAN]);
    expect(html).toContain('data-testid="orphan-warning"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "This correction does not apply to anything. It may reference a deleted or renamed item.",
    );
    expect(html).toContain("services:order");
    expect(html).toContain("service-order-orphaned");
  });

  test("no orphaned corrections: no warning rendered", () => {
    const html = render([]);
    expect(html).not.toContain("orphan-warning");
    expect(html).not.toContain(
      "This correction does not apply to anything.",
    );
  });

  test("warning is visible outside the evidence-layer filter (default direct view)", () => {
    // The default evidence state is "direct"; the orphan banner must not
    // hide behind the owner-corrected evidence filter.
    const html = render([ORPHAN]);
    expect(html).toContain('data-testid="evidence-direct"');
    expect(html).toContain('data-testid="orphan-warning"');
  });
});
