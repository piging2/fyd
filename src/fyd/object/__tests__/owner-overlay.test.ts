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

import { mkdtempSync } from "node:fs";
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
  findBusinessObject,
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
