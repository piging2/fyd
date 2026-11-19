/**
 * W-23: the PING projection read seam (parseAndVerify behind
 * getPingObjectGraph) verifies before it serves: meta shape, per-object
 * provenance, and the graph digest. Until this suite it had no tests at
 * all, while the tenant overlay applier beside it did. These cases drive
 * the public entry against fixture projections in a temporary
 * FYD_PROJECTION_DIR, including the tamper shapes the module exists to
 * refuse.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize } from "@/lib/ping/ask-composer";
import { getPingObjectGraph } from "../ping-object-source";

const SITE = "fixture-site";

type FixtureGraph = ReturnType<typeof baseGraph>;

function baseGraph() {
  return {
    objects: [
      {
        id: "obj-1",
        schema: "local-business",
        visibility: "public",
        title: "Fixture Business",
        fields: {},
        provenance: { kind: "canonical-journal", ref: "ping-event:seed" },
      },
    ],
    relationships: [] as unknown[],
  };
}

function digestOf(graph: FixtureGraph): string {
  return createHash("sha256")
    .update(canonicalize(graph), "utf8")
    .digest("hex");
}

function projectionDoc(
  mutate?: (doc: {
    meta: Record<string, unknown>;
    graph: FixtureGraph;
  }) => void,
): { meta: Record<string, unknown>; graph: FixtureGraph } {
  const graph = baseGraph();
  const doc: { meta: Record<string, unknown>; graph: FixtureGraph } = {
    meta: {
      siteId: SITE,
      dumpedAt: "2026-11-19T00:00:00Z",
      dumperVersion: "fyd-projection-dump@1.2.2",
      baseDigest: "base",
      fixtureFileDigest: "fixture",
      graphDigest: digestOf(graph),
      generatedAt: "2026-11-19T00:00:00Z",
      overlayEventIds: [],
    },
    graph,
  };
  if (mutate) mutate(doc);
  return doc;
}

describe("ping-object-source read seam (W-23)", () => {
  let dir = "";
  let savedEnv: string | undefined;

  beforeAll(() => {
    savedEnv = process.env.FYD_PROJECTION_DIR;
    dir = mkdtempSync(join(tmpdir(), "ping-projection-"));
    process.env.FYD_PROJECTION_DIR = dir;
  });

  afterAll(() => {
    if (savedEnv === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  function serve(doc: unknown): void {
    writeFileSync(join(dir, SITE + ".json"), JSON.stringify(doc), "utf8");
  }

  it("serves a valid projection", async () => {
    serve(projectionDoc());
    const out = await getPingObjectGraph(SITE, { ownerOverlay: false });
    expect(out.graph.objects).toHaveLength(1);
    expect(out.graph.objects[0]?.title).toBe("Fixture Business");
    expect(out.meta.siteId).toBe(SITE);
  });

  it("refuses a graph tampered after the digest was computed", async () => {
    serve(
      projectionDoc((doc) => {
        doc.graph.objects[0]!.title = "Tampered Business";
      }),
    );
    await expect(
      getPingObjectGraph(SITE, { ownerOverlay: false }),
    ).rejects.toThrow(/graphDigest mismatch/);
  });

  it("refuses a projection written for another site", async () => {
    serve(
      projectionDoc((doc) => {
        doc.meta.siteId = "another-site";
      }),
    );
    await expect(
      getPingObjectGraph(SITE, { ownerOverlay: false }),
    ).rejects.toThrow(/does not match requested site/);
  });

  it("refuses an object whose provenance ref was stripped", async () => {
    serve(
      projectionDoc((doc) => {
        (doc.graph.objects[0]!.provenance as { ref: string }).ref = "";
        doc.meta.graphDigest = digestOf(doc.graph);
      }),
    );
    await expect(
      getPingObjectGraph(SITE, { ownerOverlay: false }),
    ).rejects.toThrow(/lacks provenance ref/);
  });

  it("refuses an empty dumperVersion", async () => {
    serve(
      projectionDoc((doc) => {
        doc.meta.dumperVersion = "";
      }),
    );
    await expect(
      getPingObjectGraph(SITE, { ownerOverlay: false }),
    ).rejects.toThrow(/bad "dumperVersion"/);
  });

  it("refuses a dumperVersion other than the pinned one (W-16)", async () => {
    serve(
      projectionDoc((doc) => {
        doc.meta.dumperVersion = "fyd-projection-dump@9.9.9";
      }),
    );
    await expect(
      getPingObjectGraph(SITE, { ownerOverlay: false }),
    ).rejects.toThrow(/not the pinned dumper version/);
  });

  it("refuses a site with no projection file", async () => {
    await expect(
      getPingObjectGraph("absent-site", { ownerOverlay: false }),
    ).rejects.toThrow(/no PING projection/);
  });
});
