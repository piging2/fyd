/**
 * Ask FYD authorized graph read: falsification tests (Worker A).
 *
 * These tests pin the rerouted read boundary:
 *   FYD -> PingObjectReader -> fixture base + journal overlays -> digest
 *   verification -> graph
 *
 * (a) The ask pipeline no longer reads FYD_PROJECTION_DIR disk JSON: a
 *     sentinel projection on disk can never leak into answers.
 * (b) Journal overlay ops compose deterministically through the governed
 *     reader, fail closed on malformed ops, and never cross tenants.
 * (c) The owner overlay still composes ABOVE the read seam (SOURCE SAYS X
 *     / OWNER SAYS Y), unchanged in semantics.
 *
 * Run: npx jest --config src/fyd/ask/jest.config.cjs graph-read-route
 */
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize } from "../../../lib/ping/ask-composer";
import {
  getFydTenantGraph,
  type FydOverlayReader,
} from "../../data/fyd-tenant-graph";
import { loadBundleWithOwnerOverlay } from "../../../app/api/fyd/ask/ask-pipeline";
import { answerAskFyd } from "../visitor-answer";
import { applyOwnerCommand } from "../../object/owner-store";

const HAPPY = "happy-place";
const HAPPY_BIZ = "website-business-6fa5ebd99d72c4cb";
const SOURCE_PHONE = "+15412865190";
const OWNER_PHONE = "+15415550123";

function stubReader(
  overlays: Array<{ eventId: string; timestamp: string; ops: unknown[] }>,
  seen: string[] = [],
): FydOverlayReader {
  return {
    queryFydSiteOverlays: async (siteId: string) => {
      seen.push(siteId);
      return overlays.map((o) => ({ ...o, ops: o.ops }));
    },
  };
}

const EMPTY_READER = stubReader([]);

function ev(id: string, ops: unknown[]) {
  return { eventId: id, timestamp: `2026-09-19T18:00:0${id.slice(-1)}.000Z`, ops };
}

describe("authorized graph read seam", () => {
  test("unknown tenant fails closed, never serves another tenant's graph", async () => {
    await expect(getFydTenantGraph("no-such-site", { reader: EMPTY_READER })).rejects.toThrow(
      /unknown_tenant/,
    );
  });

  test("malformed overlay op fails the whole read (fail closed)", async () => {
    const reader = stubReader([ev("ev-1", [{ op: "bogus_op_kind" }])]);
    await expect(getFydTenantGraph(HAPPY, { reader })).rejects.toThrow(/overlay_malformed/);
  });

  test("overlay with non-list ops fails the whole read", async () => {
    const reader = stubReader([{ eventId: "ev-1", timestamp: "2026-09-19T18:00:00.000Z", ops: {} as unknown as unknown[] }]);
    await expect(getFydTenantGraph(HAPPY, { reader })).rejects.toThrow(/overlay_malformed/);
  });

  test("overlay ops compose deterministically with journal provenance", async () => {
    const reader = stubReader([
      ev("ev-1", [
        {
          op: "add_object",
          object: {
            id: "website-service-stub-1",
            schema: "ping.social.service@1",
            controllerId: "identity_fyd_demo_operator",
            visibility: "public",
            title: "Stub Service",
            description: "Added by the journal in this test.",
            fields: { name: "Stub Service" },
            createdAt: "2026-09-19T18:00:01.000Z",
            updatedAt: "2026-09-19T18:00:01.000Z",
            provenance: { kind: "overlay-authored", ref: "test", derivedAt: "2026-09-19T18:00:01.000Z" },
          },
        },
      ]),
      ev("ev-2", [
        {
          op: "add_relationship",
          relationship: {
            id: "rel-stub-1",
            subject: HAPPY_BIZ,
            predicate: "offers",
            object: "website-service-stub-1",
            status: "active",
            createdAt: "2026-09-19T18:00:02.000Z",
          },
        },
      ]),
      ev("ev-3", [
        {
          op: "set_field",
          objectId: HAPPY_BIZ,
          field: "tagline",
          value: "Built right. Built to last.",
        },
      ]),
      ev("ev-4", [{ op: "deactivate_object", objectId: "website-service-stub-1" }]),
    ]);
    const tenant = await getFydTenantGraph(HAPPY, { reader });

    const added = tenant.graph.objects.find((o) => o.id === "website-service-stub-1");
    expect(added).toBeDefined();
    // Deactivated by the later overlay: present but private.
    expect(added!.visibility).toBe("private");
    expect(added!.provenance.kind).toBe("canonical-journal");
    expect(added!.provenance.ref).toBe("ping-event:ev-1");

    const rel = tenant.graph.relationships.find((r) => r.id === "rel-stub-1");
    expect(rel).toBeDefined();
    expect(rel!.evidenceRef).toBe("ping-event:ev-2");

    const biz = tenant.graph.objects.find((o) => o.id === HAPPY_BIZ);
    expect(biz!.fields.tagline).toBe("Built right. Built to last.");
    expect(biz!.provenance.updatedRefs).toContain("ping-event:ev-3");

    expect(tenant.meta.eventIds).toEqual(["ev-1", "ev-2", "ev-3", "ev-4"]);
    expect(tenant.meta.siteId).toBe(HAPPY);
    expect(tenant.meta.baseDigest).toHaveLength(64);
    // The graph digest is the digest of the composed graph: self-consistent.
    expect(tenant.meta.graphDigest).toBe(
      createHash("sha256").update(canonicalize(tenant.graph), "utf8").digest("hex"),
    );
  });

  test("presentation intents accumulate journal-ordered; clear removes", async () => {
    const intent = (id: string, digest: string) => ({
      op: "set_presentation_intent",
      intentId: id,
      siteIntent: { kind: "reorder_sections" },
      proposal: { proposalDigest: digest },
      approval: {
        proposalDigest: digest,
        approvedBy: "demo-owner (seeded, unverified)",
        approvedAt: "2026-09-19T18:00:00.000Z",
        note: "DEMO OWNER MODE - not real authentication",
      },
    });
    const reader = stubReader([
      ev("ev-1", [intent("pi-a", "digest-a")]),
      ev("ev-2", [intent("pi-b", "digest-b")]),
      ev("ev-3", [{ op: "clear_presentation_intent", intentId: "pi-a" }]),
    ]);
    const tenant = await getFydTenantGraph(HAPPY, { reader });
    expect(tenant.presentationIntent).not.toBeNull();
    expect(tenant.presentationIntent!.directives.map((d) => d.intentId)).toEqual(["pi-b"]);
    expect(tenant.presentationIntent!.directives[0].approval.eventId).toBe("ev-2");
    expect(tenant.presentationIntent!.provenance.kind).toBe("owner-presentation-intent");
  });

  test("the reader is called with the tenant site id (seam-level tenant scoping)", async () => {
    const seen: string[] = [];
    const tenant = await getFydTenantGraph(HAPPY, { reader: stubReader([], seen) });
    expect(seen).toEqual([HAPPY]);
    // No overlays: the pinned fixture base serves as-is (7 objects).
    expect(tenant.graph.objects).toHaveLength(7);
    expect(tenant.meta.eventIds).toEqual([]);
    expect(tenant.presentationIntent).toBeNull();
  });

  test("reads never mutate the pinned fixture base", async () => {
    const deactivating = stubReader([
      ev("ev-1", [{ op: "deactivate_object", objectId: HAPPY_BIZ }]),
    ]);
    const first = await getFydTenantGraph(HAPPY, { reader: deactivating });
    expect(first.graph.objects.find((o) => o.id === HAPPY_BIZ)!.visibility).toBe("private");
    const second = await getFydTenantGraph(HAPPY, { reader: EMPTY_READER });
    expect(second.graph.objects.find((o) => o.id === HAPPY_BIZ)!.visibility).toBe("public");
  });

  test("the authorized read never consults FYD_PROJECTION_DIR (sentinel)", async () => {
    // If any code path still read dump.py disk JSON, this sentinel business
    // phone would leak into the graph and the answers.
    const dir = mkdtempSync(join(tmpdir(), "fyd-disk-sentinel-"));
    writeFileSync(
      join(dir, "happy-place.json"),
      JSON.stringify({
        meta: { siteId: HAPPY },
        graph: {
          objects: [
            {
              id: HAPPY_BIZ,
              fields: { phone: "DISK-SENTINEL-000" },
            },
          ],
          relationships: [],
        },
      }),
      "utf8",
    );
    const saved = process.env.FYD_PROJECTION_DIR;
    process.env.FYD_PROJECTION_DIR = dir;
    try {
      const tenant = await getFydTenantGraph(HAPPY, { reader: EMPTY_READER });
      const asText = JSON.stringify(tenant.graph);
      expect(asText).not.toContain("DISK-SENTINEL-000");
      // The fixture base still serves the real phone.
      const biz = tenant.graph.objects.find((o) => o.id === HAPPY_BIZ);
      expect(biz!.fields.phone).toBe(SOURCE_PHONE);
    } finally {
      if (saved === undefined) delete process.env.FYD_PROJECTION_DIR;
      else process.env.FYD_PROJECTION_DIR = saved;
    }
  });

  test("the authorized read is unaffected by invalid JSON in FYD_PROJECTION_DIR", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fyd-disk-invalid-"));
    writeFileSync(join(dir, "happy-place.json"), "{ this is not valid json", "utf8");
    const saved = process.env.FYD_PROJECTION_DIR;
    process.env.FYD_PROJECTION_DIR = dir;
    try {
      const tenant = await getFydTenantGraph(HAPPY, { reader: EMPTY_READER });
      expect(tenant.graph.objects.length).toBeGreaterThan(0);
    } finally {
      if (saved === undefined) delete process.env.FYD_PROJECTION_DIR;
      else process.env.FYD_PROJECTION_DIR = saved;
    }
  });
});

describe("owner overlay above the read seam", () => {
  test("SOURCE SAYS X / OWNER SAYS Y composes over the authorized read", async () => {
    process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-seam-test-"));
    applyOwnerCommand(
      HAPPY,
      { type: "set-contact-field", field: "phone", value: OWNER_PHONE },
      [],
      new Map(),
      { sourceValue: SOURCE_PHONE, actorLabel: "Demo Owner (seeded, unverified)" },
    );

    const bundle = await loadBundleWithOwnerOverlay(HAPPY, EMPTY_READER);
    expect(bundle).not.toBeNull();
    const biz = bundle!.graph.objects.find((o) => o.id === HAPPY_BIZ)!;
    // EFFECTIVE value wins; the source value is preserved on the record.
    expect(biz.fields.phone).toBe(OWNER_PHONE);
    expect(biz.ownerFieldCorrections).toBeDefined();
    expect(biz.ownerFieldCorrections![0].ownerValue).toBe(OWNER_PHONE);
    expect(biz.ownerFieldCorrections![0].sourceValue).toBe(SOURCE_PHONE);

    const out = answerAskFyd(
      { siteId: HAPPY, question: "What is the phone number?", mode: "visitor" },
      { loadBundle: (id) => (id === HAPPY ? bundle : null) },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain(OWNER_PHONE);
    expect(out.answer).toContain(SOURCE_PHONE);
    const phoneCite = out.citations.find((c) => c.id.endsWith("#phone"));
    expect(phoneCite).toBeDefined();
    expect(phoneCite!.source).toBe("Owner correction");
  });
});
