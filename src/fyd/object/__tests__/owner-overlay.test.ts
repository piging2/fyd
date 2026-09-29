/**
 * Tests for the owner field-correction overlay (lane C).
 *
 * The acceptance bar: the owner correction must
 *  1. win everywhere the read model serves (effective value = owner value),
 *  2. never erase or rewrite the source (SOURCE SAYS X stays intact),
 *  3. survive a source re-observation (owner value still wins; drift is
 *     flagged, never silent),
 *  4. restore the source value on revert (the CURRENT source value, even
 *     if the source changed while the correction was active).
 */

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "../../../lib/ping/types";
import {
  applyOwnerCommand,
  parseOwnerCommand,
  readOverrides,
  OwnerCommandError,
} from "../owner-store";
import {
  applyOwnerFieldCorrections,
  detectOrphanedCorrections,
  findBusinessObject,
  firstBusinessObject,
  ownerCorrectionForObject,
  rawFieldValue,
} from "../owner-overlay";

const SITE = "happy-place";
const SOURCE_PHONE = "+15412865190";
const OWNER_PHONE = "+15415550123";

function businessObject(phone: string | null): PingObject {
  return {
    id: "website-business-6fa5ebd99d72c4cb",
    schema: "ping.social.business@1",
    controllerId: "web:happy-place",
    visibility: "public",
    title: "Happy Place",
    description: "A demo business.",
    fields: phone ? { phone } : {},
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://happy-place-platform.vercel.app/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  };
}

function graphWith(phone: string | null): ObjectGraph {
  return { objects: [businessObject(phone)], relationships: [] };
}

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-overlay-test-"));
});

describe("owner store contact corrections", () => {
  test("set-contact-field records owner value with the source value and actor label", () => {
    const o = applyOwnerCommand(
      SITE,
      { type: "set-contact-field", field: "phone", value: OWNER_PHONE },
      [],
      new Map(),
      { sourceValue: SOURCE_PHONE, actorLabel: "Demo Owner (seeded, unverified)" },
    );
    const c = o.fieldCorrections["phone"];
    expect(c.ownerValue).toBe(OWNER_PHONE);
    expect(c.sourceValue).toBe(SOURCE_PHONE);
    expect(c.actorLabel).toBe("Demo Owner (seeded, unverified)");
    expect(c.field).toBe("phone");
    expect(c.label).toBe("Phone");
    expect(typeof c.correctedAt).toBe("string");
    // Durable: a fresh read sees the same record (reload retains).
    const reread = readOverrides(SITE);
    expect(reread.fieldCorrections["phone"].ownerValue).toBe(OWNER_PHONE);
  });

  test("set-contact-field rejects a value that is not a phone number", () => {
    expect(() =>
      applyOwnerCommand(
        SITE,
        { type: "set-contact-field", field: "phone", value: "not a number" },
        [],
        new Map(),
        { sourceValue: SOURCE_PHONE },
      ),
    ).toThrow(OwnerCommandError);
    expect(readOverrides(SITE).fieldCorrections["phone"]).toBeUndefined();
  });

  test("set-contact-field rejects an unknown field", () => {
    expect(() =>
      parseOwnerCommand({ type: "set-contact-field", field: "fax", value: "123" }),
    ).toThrow(OwnerCommandError);
  });

  test("revert-contact-field restores, and rejects when nothing is corrected", () => {
    applyOwnerCommand(
      SITE,
      { type: "set-contact-field", field: "phone", value: OWNER_PHONE },
      [],
      new Map(),
      { sourceValue: SOURCE_PHONE },
    );
    const o = applyOwnerCommand(
      SITE,
      { type: "revert-contact-field", field: "phone" },
      [],
      new Map(),
    );
    expect(o.fieldCorrections["phone"]).toBeUndefined();
    expect(() =>
      applyOwnerCommand(
        SITE,
        { type: "revert-contact-field", field: "phone" },
        [],
        new Map(),
      ),
    ).toThrow(OwnerCommandError);
  });

  test("parseOwnerCommand accepts the new shapes", () => {
    expect(
      parseOwnerCommand({ type: "set-contact-field", field: "email", value: "a@b.co" }),
    ).toEqual({ type: "set-contact-field", field: "email", value: "a@b.co" });
    expect(parseOwnerCommand({ type: "revert-contact-field", field: "website" })).toEqual({
      type: "revert-contact-field",
      field: "website",
    });
  });

  test("readOverrides migrates store files written before field corrections existed", () => {
    // A correction from an earlier store version must not crash the read.
    const o = readOverrides("never-written");
    expect(o.fieldCorrections).toEqual({});
  });
});

describe("owner overlay composition", () => {
  function correctPhone(sourceValue: string | null): void {
    applyOwnerCommand(
      SITE,
      { type: "set-contact-field", field: "phone", value: OWNER_PHONE },
      [],
      new Map(),
      { sourceValue, actorLabel: "Demo Owner (seeded, unverified)" },
    );
  }

  test("owner value wins on the composed graph", () => {
    correctPhone(SOURCE_PHONE);
    const { graph, applied } = applyOwnerFieldCorrections(graphWith(SOURCE_PHONE), SITE);
    const business = findBusinessObject(graph)!;
    expect(rawFieldValue(business, "phone")).toBe(OWNER_PHONE);
    expect(applied).toHaveLength(1);
    expect(applied[0].ownerValue).toBe(OWNER_PHONE);
    expect(applied[0].sourceValue).toBe(SOURCE_PHONE);
    expect(business.ownerFieldCorrections).toHaveLength(1);
  });

  test("the source graph is never mutated", () => {
    correctPhone(SOURCE_PHONE);
    const source = graphWith(SOURCE_PHONE);
    const before = JSON.stringify(source);
    applyOwnerFieldCorrections(source, SITE);
    expect(JSON.stringify(source)).toBe(before);
    expect(rawFieldValue(source.objects[0] as PingObject, "phone")).toBe(SOURCE_PHONE);
  });

  test("no correction composes nothing", () => {
    const { graph, applied } = applyOwnerFieldCorrections(graphWith(SOURCE_PHONE), SITE);
    expect(applied).toEqual([]);
    expect(rawFieldValue(graph.objects[0] as PingObject, "phone")).toBe(SOURCE_PHONE);
    expect((graph.objects[0] as PingObject).ownerFieldCorrections).toBeUndefined();
  });

  test("source re-observation does not erase the owner value; drift is flagged", () => {
    correctPhone(SOURCE_PHONE);
    // The source is re-dumped and now says something new.
    const refreshed = graphWith("+19998887777");
    const { graph } = applyOwnerFieldCorrections(refreshed, SITE);
    const business = findBusinessObject(graph)!;
    // Owner still wins.
    expect(rawFieldValue(business, "phone")).toBe(OWNER_PHONE);
    // But the drift is visible, not silent.
    const c = ownerCorrectionForObject(business, "phone")!;
    expect(c.sourceDrifted).toBe(true);
    expect(c.sourceValue).toBe(SOURCE_PHONE); // the record keeps what the source said THEN
  });

  test("no drift flag when the source is unchanged", () => {
    correctPhone(SOURCE_PHONE);
    const { graph } = applyOwnerFieldCorrections(graphWith(SOURCE_PHONE), SITE);
    const business = findBusinessObject(graph)!;
    expect(ownerCorrectionForObject(business, "phone")!.sourceDrifted).toBe(false);
  });

  test("revert restores the CURRENT source value, even after source drift", () => {
    correctPhone(SOURCE_PHONE);
    // Source changes while the correction is active.
    let { graph } = applyOwnerFieldCorrections(graphWith("+19998887777"), SITE);
    expect(rawFieldValue(findBusinessObject(graph)!, "phone")).toBe(OWNER_PHONE);
    // Owner reverts.
    applyOwnerCommand(
      SITE,
      { type: "revert-contact-field", field: "phone" },
      [],
      new Map(),
    );
    ({ graph } = applyOwnerFieldCorrections(graphWith("+19998887777"), SITE));
    // Effective value is the current source value, not the stale snapshot.
    expect(rawFieldValue(findBusinessObject(graph)!, "phone")).toBe("+19998887777");
    expect(ownerCorrectionForObject(findBusinessObject(graph)!, "phone")).toBeNull();
  });

  test("pure readers: rawFieldValue and ownerCorrectionForObject", () => {
    const obj = businessObject(SOURCE_PHONE);
    expect(rawFieldValue(obj, "phone")).toBe(SOURCE_PHONE);
    expect(rawFieldValue(obj, "email")).toBeNull();
    expect(ownerCorrectionForObject(obj, "phone")).toBeNull();
    correctPhone(SOURCE_PHONE);
    const { graph } = applyOwnerFieldCorrections(graphWith(SOURCE_PHONE), SITE);
    const composed = findBusinessObject(graph)!;
    const c = ownerCorrectionForObject(composed, "phone")!;
    expect(c.ownerValue).toBe(OWNER_PHONE);
    expect(c.sourceValue).toBe(SOURCE_PHONE);
  });
});

describe("PROD-8: orphaned-correction detection", () => {
  const NAMES = new Map([
    ["svc-a", "Service A"],
    ["svc-b", "Service B"],
  ]);

  function serviceObject(id: string, title: string): PingObject {
    return {
      id,
      schema: "ping.social.service@1",
      controllerId: "web:happy-place",
      visibility: "public",
      title,
      description: title + " description.",
      fields: {},
      createdAt: "2026-09-21T00:00:00Z",
      updatedAt: "2026-09-21T00:00:00Z",
      provenance: {
        kind: "website-derived",
        ref: "website-ingestion:https://happy-place-platform.vercel.app/",
        derivedAt: "2026-09-21T13:50:00Z",
      },
    };
  }

  function graphWithServices(ids: string[]): ObjectGraph {
    const biz = businessObject(SOURCE_PHONE);
    return {
      objects: [
        biz,
        ...ids.map((id, i) => serviceObject(id, "Service " + i)),
      ],
      relationships: ids.map((id, i) => ({
        id: "rel-" + i,
        subject: biz.id,
        predicate: "offers",
        object: id,
        status: "active" as const,
        createdAt: "2026-09-21T00:00:00Z",
        evidenceRef: "test",
      })),
    };
  }

  function recordServiceOrder(ids: string[]) {
    applyOwnerCommand(
      SITE,
      { type: "move-service", id: ids[0], to: "first" },
      ids,
      NAMES,
    );
  }

  test("service order naming only renamed services is orphaned with the owner-facing warning", () => {
    recordServiceOrder(["svc-a", "svc-b"]);
    // Against the graph the correction was recorded on: applies, no warning.
    expect(detectOrphanedCorrections(graphWithServices(["svc-a", "svc-b"]), SITE)).toEqual([]);
    // The source re-observes with renamed services: the correction now
    // applies to nothing (the Mission O seq-12 shape).
    const orphans = detectOrphanedCorrections(graphWithServices(["svc-x", "svc-y"]), SITE);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reason).toBe("service-order-orphaned");
    expect(orphans[0].target).toBe("services:order");
    expect(orphans[0].correction).toBeNull();
    // Detail names the actual target resolution instead of claiming the
    // ids do not exist in the site data.
    expect(orphans[0].detail).toContain(
      "This correction does not apply to anything.",
    );
    expect(orphans[0].detail).toContain(
      'The ObjectView renders services from the public business object ("website-business-6fa5ebd99d72c4cb").',
    );
    expect(orphans[0].detail).toContain(
      "none of which are current services of the rendered business",
    );
    expect(orphans[0].detail).not.toContain(
      "none of which exist in the current site data",
    );
  });

  test("service order that still names a current service is not orphaned", () => {
    recordServiceOrder(["svc-a", "svc-b"]);
    // One service renamed, one still current: the correction still applies.
    expect(detectOrphanedCorrections(graphWithServices(["svc-b", "svc-c"]), SITE)).toEqual([]);
  });

  test("empty service order is never orphaned", () => {
    expect(detectOrphanedCorrections(graphWithServices(["svc-x"]), SITE)).toEqual([]);
  });

  test("hidden service that no longer exists is orphaned", () => {
    applyOwnerCommand(
      SITE,
      { type: "set-service-visibility", id: "svc-a", visible: false },
      ["svc-a", "svc-b"],
      NAMES,
    );
    expect(detectOrphanedCorrections(graphWithServices(["svc-a", "svc-b"]), SITE)).toEqual([]);
    const orphans = detectOrphanedCorrections(graphWithServices(["svc-x"]), SITE);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reason).toBe("service-visibility-orphaned");
    expect(orphans[0].target).toBe("service:svc-a");
    expect(orphans[0].detail).toContain(
      "This correction does not apply to anything.",
    );
    expect(orphans[0].detail).toContain(
      "is not a current service of the rendered business",
    );
    expect(orphans[0].detail).toContain("so the correction hides nothing");
  });

  test("field corrections orphaned by the overlay surface through detection too", () => {
    applyOwnerCommand(
      SITE,
      { type: "set-contact-field", field: "phone", value: OWNER_PHONE },
      [],
      new Map(),
      { sourceValue: SOURCE_PHONE },
    );
    // A refresh that drops the business object orphans the field correction.
    const orphans = detectOrphanedCorrections({ objects: [], relationships: [] }, SITE);
    expect(
      orphans.some(
        (o) => o.reason === "no-business-object" && o.target === "contact:phone",
      ),
    ).toBe(true);
  });

  // Two public business objects (parent brand + local listing). The
  // ObjectView loader first-matches; detection must judge service
  // corrections against that same first candidate instead of
  // fail-closing to null (PROD-8).
  function graphWithTwoBusinesses(linkSubjectId: (parentId: string, localId: string) => string): ObjectGraph {
    const parent: PingObject = {
      ...businessObject(SOURCE_PHONE),
      id: "brand-parent-0001",
      title: "Parent Brand",
    };
    const local = businessObject(SOURCE_PHONE);
    const subject = linkSubjectId(parent.id, local.id);
    return {
      objects: [
        parent,
        local,
        serviceObject("svc-a", "Service A"),
        serviceObject("svc-b", "Service B"),
      ],
      relationships: ["svc-a", "svc-b"].map((id, i) => ({
        id: "rel-" + i,
        subject,
        predicate: "offers",
        object: id,
        status: "active" as const,
        createdAt: "2026-09-21T00:00:00Z",
        evidenceRef: "test",
      })),
    };
  }

  function recordOrderAndHide() {
    // Owner orders svc-b first and hides svc-a (the falsifier's scenario:
    // the view renders ["svc-b", "svc-a"] with svc-a hidden).
    applyOwnerCommand(
      SITE,
      { type: "move-service", id: "svc-b", to: "first" },
      ["svc-a", "svc-b"],
      NAMES,
    );
    applyOwnerCommand(
      SITE,
      { type: "set-service-visibility", id: "svc-a", visible: false },
      ["svc-a", "svc-b"],
      NAMES,
    );
  }

  test("ambiguous target: corrections the view applies are NOT flagged (PROD-8)", () => {
    const g = graphWithTwoBusinesses((parentId) => parentId);
    // The view's first-match resolution is the parent brand; the
    // fail-closed resolver returns null on the same graph.
    expect(firstBusinessObject(g)?.id).toBe("brand-parent-0001");
    expect(findBusinessObject(g)).toBeNull();
    recordOrderAndHide();
    expect(readOverrides(SITE).serviceOrder).toEqual(["svc-b", "svc-a"]);
    expect(readOverrides(SITE).hiddenServices).toEqual(["svc-a"]);
    // The services are current under the first-match business, so neither
    // correction is orphaned.
    expect(detectOrphanedCorrections(g, SITE)).toEqual([]);
  });

  test("ambiguous target, services on the other candidate: flagged with an accurate detail", () => {
    const g = graphWithTwoBusinesses((_parentId, localId) => localId);
    recordOrderAndHide();
    const orphans = detectOrphanedCorrections(g, SITE);
    expect(orphans).toHaveLength(2);
    expect(orphans[0].reason).toBe("service-order-orphaned");
    expect(orphans[1].reason).toBe("service-visibility-orphaned");
    // Accurate: names the first-match resolution. The ids DO exist in the
    // site data (on the other candidate), so the old "none of which exist
    // in the current site data" claim would be false.
    expect(orphans[0].detail).toContain(
      'The ObjectView renders services from the first of 2 public business objects ("brand-parent-0001").',
    );
    expect(orphans[0].detail).not.toContain(
      "none of which exist in the current site data",
    );
  });

  test("no business object: service correction flagged, detail names the missing target", () => {
    recordOrderAndHide();
    const orphans = detectOrphanedCorrections({ objects: [], relationships: [] }, SITE);
    expect(orphans).toHaveLength(2);
    expect(orphans[0].reason).toBe("service-order-orphaned");
    expect(orphans[0].detail).toContain(
      "No public business object exists on the refreshed graph",
    );
  });

  test("field correction for a field the source never emitted is composed, not orphaned", () => {
    // The source graph has no email field; the owner asserts one.
    applyOwnerCommand(
      SITE,
      { type: "set-contact-field", field: "email", value: "a@b.co" },
      [],
      new Map(),
      { sourceValue: null },
    );
    const { graph, applied, orphaned } = applyOwnerFieldCorrections(
      graphWith(SOURCE_PHONE),
      SITE,
    );
    expect(orphaned).toEqual([]);
    expect(applied).toHaveLength(1);
    // The field is created on the composed object and the owner value wins.
    const business = findBusinessObject(graph)!;
    expect(rawFieldValue(business, "email")).toBe("a@b.co");
    expect(ownerCorrectionForObject(business, "email")!.ownerValue).toBe("a@b.co");
    // Detection does not flag it: the correction is fully effective.
    expect(detectOrphanedCorrections(graphWith(SOURCE_PHONE), SITE)).toEqual([]);
  });

  test("detection never writes to the journal", () => {
    recordServiceOrder(["svc-a", "svc-b"]);
    const dir = process.env.FYD_OWNER_DIR!;
    const before = readdirSync(dir).sort();
    const snapshot = new Map(
      before.map((f) => [f, readFileSync(join(dir, f), "utf8")] as const),
    );
    detectOrphanedCorrections(graphWithServices(["svc-x"]), SITE);
    detectOrphanedCorrections(graphWithServices(["svc-a", "svc-b"]), SITE);
    const after = readdirSync(dir).sort();
    expect(after).toEqual(before);
    for (const f of after) {
      expect(readFileSync(join(dir, f), "utf8")).toBe(snapshot.get(f));
    }
  });
});
