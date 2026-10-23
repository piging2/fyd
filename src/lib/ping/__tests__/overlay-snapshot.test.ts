/**
 * Bundled overlay snapshot fallback tests (chat-wire fix).
 *
 * Prove that when the FYD journal gateway is unreachable:
 *  (a) with FYD_OVERLAY_SNAPSHOT unset and a snapshot present at the
 *      default path (fyd-projections/fyd-overlay-snapshot.json, resolved
 *      against process.cwd()), queryFydSiteOverlays returns that
 *      tenant's parsed overlays and no other tenant's;
 *  (b) with no snapshot file at the default path, the call still throws
 *      (fail-closed preserved);
 *  (c) FYD_OVERLAY_SNAPSHOT pointing at a custom file is honored and
 *      wins over the default path.
 *
 * Hermetic: the tests chdir into committed fixture directories under
 * ./fixtures (stub-shaped events, clearly fake ids) and never write
 * files at runtime, so they neither depend on nor touch a real
 * fyd-projections/fyd-overlay-snapshot.json in the repo root.
 */
import { join } from "node:path";
import { getPingObjectReader } from "../ping-object-reader";

const FIXTURES = join(__dirname, "fixtures");
const DIR_DEFAULT = join(FIXTURES, "overlay-default");
const DIR_EMPTY = join(FIXTURES, "overlay-empty");
const CUSTOM_SNAPSHOT = join(FIXTURES, "overlay-custom", "custom-snapshot.json");

describe("queryFydSiteOverlays bundled snapshot fallback", () => {
  const savedCwd = process.cwd();
  const savedGateway = process.env.FYD_JOURNAL_GATEWAY_URL;
  const savedSnapshot = process.env.FYD_OVERLAY_SNAPSHOT;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Gateway unreachable: nothing listens on port 1.
    process.env.FYD_JOURNAL_GATEWAY_URL = "http://127.0.0.1:1";
    delete process.env.FYD_OVERLAY_SNAPSHOT;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.chdir(savedCwd);
    if (savedGateway === undefined) delete process.env.FYD_JOURNAL_GATEWAY_URL;
    else process.env.FYD_JOURNAL_GATEWAY_URL = savedGateway;
    if (savedSnapshot === undefined) delete process.env.FYD_OVERLAY_SNAPSHOT;
    else process.env.FYD_OVERLAY_SNAPSHOT = savedSnapshot;
  });

  test("(a) default path snapshot is served when env is unset, tenant-filtered", async () => {
    process.chdir(DIR_DEFAULT);
    const reader = getPingObjectReader();
    const overlays = await reader.queryFydSiteOverlays("happy-place");

    expect(overlays.map((o) => o.eventId)).toEqual(["snap-ev-happy-1", "snap-ev-happy-2"]);
    expect(overlays[0].timestamp).toBe("2026-09-19T18:30:59.221Z");
    expect(overlays[0].ops).toEqual([
      { op: "set_field", objectId: "obj-1", field: "tagline", value: "Hi" },
    ]);
  });

  test("(b) no snapshot at the default path still throws (fail-closed)", async () => {
    process.chdir(DIR_EMPTY);
    const reader = getPingObjectReader();
    await expect(reader.queryFydSiteOverlays("happy-place")).rejects.toThrow();
  });

  test("(c) FYD_OVERLAY_SNAPSHOT custom path is honored and wins over the default", async () => {
    // DIR_DEFAULT holds a snapshot with different event ids; the custom
    // file must win.
    process.chdir(DIR_DEFAULT);
    process.env.FYD_OVERLAY_SNAPSHOT = CUSTOM_SNAPSHOT;

    const reader = getPingObjectReader();
    const overlays = await reader.queryFydSiteOverlays("happy-place");

    expect(overlays.map((o) => o.eventId)).toEqual(["snap-ev-custom"]);
    expect(overlays[0].ops).toEqual([{ op: "clear_presentation_intent", intentId: "pi-custom" }]);
  });
});
