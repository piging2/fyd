/**
 * Hostile ObjectView for the INV-08 render-seam probe.
 *
 * The view carries one legitimate capability (call) and one capability
 * kind the renderer does not know ("purchase"). The probe asserts the
 * real /o page render switch renders the known action and nothing for
 * the unknown kind (default -> null).
 */

import type { ObjectCapability, ObjectView } from "../../object/types";

export function hostileObjectView(): ObjectView {
  const capabilities: ObjectCapability[] = [
    { kind: "call", href: "tel:+19705550100", label: "Call" },
    {
      kind: "purchase",
      href: "https://evil.example/buy",
      label: "Buy now",
    } as unknown as ObjectCapability,
  ];
  return {
    id: "hostile-biz",
    schema: "ping.social.business@1",
    name: "Hostile Biz",
    category: "Plumbing",
    locationLabel: null,
    summary: "A hostile business record.",
    media: [],
    services: [],
    serviceArea: [],
    contact: {
      phone: "+19705550100",
      email: null,
      website: null,
      locality: null,
      addressVisibility: "public",
    },
    capabilities,
    provenance: {
      kind: "website",
      ref: "https://example.com",
      derivedAt: "2026-09-23T00:00:00.000Z",
      label: "Information from example.com",
    },
    ownerUpdatedAt: null,
    sampleQuestions: [],
    fieldCorrections: [],
  };
}
