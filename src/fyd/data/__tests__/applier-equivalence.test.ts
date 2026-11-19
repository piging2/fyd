/**
 * W-15: cross-applier equivalence net. The overlay journal is applied by
 * two engines that must mean the same thing: dump.py's apply_overlays
 * (PING side, writes the projections) and applyTenantOverlays in
 * fyd-tenant-graph.ts (read side, composes owner state at serve time).
 * Until this suite, nothing compared their outputs; three divergences
 * (W-12 value validation, W-13 scalar mirror sync, W-14 shallow copy)
 * were found by reading, not by a test. This suite applies one fixture
 * event stream through both engines and compares the canonicalized
 * graphs, and checks refusal parity on the malformed shapes both
 * engines must reject. The Python engine runs in a subprocess against
 * the real dump.py; if python3 is unavailable the suite fails loudly
 * rather than passing silently.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalize } from "@/lib/ping/ask-composer";
import type { ObjectGraph } from "@/fyd/object/types";
import { applyTenantOverlays } from "../fyd-tenant-graph";

const TS = "2026-11-19T00:00:00.000Z";

function baseGraph() {
  return {
    objects: [
      {
        id: "biz-1",
        schema: "ping.social.business@1",
        controllerId: "identity_fyd_demo_operator",
        visibility: "public",
        title: "Happy Place",
        fields: { title: "Happy Place", phone: "555-0100" },
        createdAt: TS,
        updatedAt: TS,
        provenance: {
          kind: "canonical-journal",
          ref: "ping-event:seed",
          derivedAt: TS,
          updatedRefs: [],
        },
      },
      {
        id: "svc-1",
        schema: "ping.social.service@1",
        controllerId: "identity_fyd_demo_operator",
        visibility: "public",
        title: "Fences",
        fields: {},
        createdAt: TS,
        updatedAt: TS,
        provenance: {
          kind: "canonical-journal",
          ref: "ping-event:seed",
          derivedAt: TS,
          updatedRefs: [],
        },
      },
    ],
    relationships: [
      {
        id: "rel-1",
        subject: "svc-1",
        object: "biz-1",
        predicate: "offered-by",
        evidenceRef: "ping-event:seed",
      },
    ],
  };
}

const OPS_STREAM: Record<string, unknown>[][] = [
  [
    { op: "set_field", objectId: "biz-1", field: "title", value: "Happy Place Carpentry" },
    { op: "set_field", objectId: "biz-1", field: "phone", value: "555-0199" },
    { op: "set_field", objectId: "svc-1", field: "tags", value: ["wood", "cedar"] },
  ],
  [
    {
      op: "add_object",
      object: {
        id: "svc-2",
        schema: "ping.social.service@1",
        controllerId: "identity_fyd_demo_operator",
        visibility: "public",
        title: "Decks (draft)",
        fields: { materials: ["cedar"] },
        createdAt: TS,
        updatedAt: TS,
      },
    },
    { op: "set_field", objectId: "svc-2", field: "title", value: "Decks" },
  ],
  [
    {
      op: "add_relationship",
      relationship: {
        id: "rel-2",
        subject: "svc-2",
        object: "biz-1",
        predicate: "offered-by",
      },
    },
  ],
  [{ op: "deactivate_object", objectId: "svc-1" }],
];

function pythonEvents() {
  return OPS_STREAM.map((ops, i) => ({
    event_id: `ev-${i + 1}`,
    timestamp: TS,
    event_data: { ops },
  }));
}

function tsOverlays() {
  return OPS_STREAM.map((ops, i) => ({
    eventId: `ev-${i + 1}`,
    timestamp: TS,
    ops,
  }));
}

const DRIVER = `
import importlib.util, json, sys, copy
spec = importlib.util.spec_from_file_location("dump", sys.argv[2])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
doc = json.load(open(sys.argv[1]))
graph, applied, intents = m.apply_overlays(copy.deepcopy(doc["graph"]), doc["events"])
sys.stdout.write(json.dumps(graph))
`;

function runPython(
  graph: unknown,
  events: unknown,
  dir: string,
): { status: number | null; stdout: string; stderr: string } {
  const fixture = join(dir, "fixture.json");
  const driver = join(dir, "driver.py");
  writeFileSync(fixture, JSON.stringify({ graph, events }), "utf8");
  writeFileSync(driver, DRIVER, "utf8");
  const dumpPath = join(process.cwd(), "tools/fyd-site-projection/dump.py");
  const res = spawnSync("python3", [driver, fixture, dumpPath], {
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("overlay applier equivalence, dump.py vs applyTenantOverlays (W-15)", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "applier-equiv-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "produces the identical graph for the shared fixture stream",
    () => {
      const py = runPython(baseGraph(), pythonEvents(), dir);
      expect(py.status).toBe(0);
      const pyGraph = JSON.parse(py.stdout) as unknown;

      const tsGraph = baseGraph() as unknown as ObjectGraph;
      applyTenantOverlays(
        tsGraph,
        tsOverlays() as Parameters<typeof applyTenantOverlays>[1],
      );

      expect(canonicalize(tsGraph)).toBe(canonicalize(pyGraph));
    },
    30000,
  );

  it(
    "refusal parity: a list value for title is refused by both engines",
    () => {
      const bad = [
        [{ op: "set_field", objectId: "biz-1", field: "title", value: ["x"] }],
      ];
      const py = runPython(
        baseGraph(),
        bad.map((ops, i) => ({
          event_id: `bad-${i + 1}`,
          timestamp: TS,
          event_data: { ops },
        })),
        dir,
      );
      expect(py.status).not.toBe(0);
      expect(py.stderr + py.stdout).toContain("bad set_field");

      const tsGraph = baseGraph() as unknown as ObjectGraph;
      expect(() =>
        applyTenantOverlays(
          tsGraph,
          bad.map((ops, i) => ({
            eventId: `bad-${i + 1}`,
            timestamp: TS,
            ops,
          })) as Parameters<typeof applyTenantOverlays>[1],
        ),
      ).toThrow(/bad set_field/);
    },
    30000,
  );

  it(
    "refusal parity: a mixed-type list value is refused by both engines",
    () => {
      const bad = [
        [
          {
            op: "set_field",
            objectId: "biz-1",
            field: "tags",
            value: ["ok", 5],
          },
        ],
      ];
      const py = runPython(
        baseGraph(),
        bad.map((ops, i) => ({
          event_id: `bad-${i + 1}`,
          timestamp: TS,
          event_data: { ops },
        })),
        dir,
      );
      expect(py.status).not.toBe(0);
      expect(py.stderr + py.stdout).toContain("bad set_field");

      const tsGraph = baseGraph() as unknown as ObjectGraph;
      expect(() =>
        applyTenantOverlays(
          tsGraph,
          bad.map((ops, i) => ({
            eventId: `bad-${i + 1}`,
            timestamp: TS,
            ops,
          })) as Parameters<typeof applyTenantOverlays>[1],
        ),
      ).toThrow(/bad set_field/);
    },
    30000,
  );
});
