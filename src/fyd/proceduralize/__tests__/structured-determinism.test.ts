/**
 * HOSTILE DETERMINISM: same source -> same facts -> same IDs -> same
 * relationships, across:
 *  - repeated runs in one process (no module-state leakage),
 *  - different prior ingestions (unrelated extraction first),
 *  - different fixture orders,
 *  - a fresh module registry (jest.isolateModules: new import order),
 *  - two separate OS processes (tsx child processes, hash compared).
 *
 * Any dependence on module history, process lifetime, test order, request
 * order, or unrelated ingestion is a FAIL.
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { extractStructuredData } from "../structured-data";
import { runExtractionPipeline, type AcquiredSource } from "../proceduralizer";
import {
  ALL_STRUCTURED_FIXTURES,
  FIXTURE_ORG_SIMPLE,
  FIXTURE_ID_REFERENCES,
} from "../__fixtures__/fixtures-structured";
import { COPPERSMITH_JSONLD_HTML } from "../__fixtures__/coppersmith-jsonld";

const CTX = { sourceUrl: "https://acme.example.com/", observedAt: "2026-09-21T12:00:00.000Z" };
const COPPER_CTX = {
  sourceUrl: "https://www.coppersmithplumbing.com/",
  observedAt: "2026-09-21T12:01:10.844Z",
};

const canon = (v: unknown) => JSON.stringify(v);

describe("hostile determinism", () => {
  test("same source twice in one process: byte-identical", async () => {
    const a = await extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    const b = await extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    expect(canon(b)).toBe(canon(a));
  });

  test("unrelated prior ingestion does not change the output", async () => {
    // Ingest a different fixture first (module-level caches would leak here).
    await extractStructuredData(FIXTURE_ORG_SIMPLE.html, CTX);
    await extractStructuredData(FIXTURE_ID_REFERENCES.html, CTX);
    const after = await extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    const fresh = await extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    expect(canon(after)).toBe(canon(fresh));
    // Entity keys are identical: no ingestion-order dependence.
    expect(after.entities.map((e) => e.key)).toEqual(fresh.entities.map((e) => e.key));
  });

  test("fixture order does not change per-fixture output", async () => {
    const runAll = async (fixtures: typeof ALL_STRUCTURED_FIXTURES) => {
      const out = new Map<string, string>();
      for (const fx of fixtures) {
        const ex = await extractStructuredData(fx.html, CTX);
        out.set(fx.name, canon(ex));
      }
      return out;
    };
    const forward = await runAll(ALL_STRUCTURED_FIXTURES);
    const backward = await runAll([...ALL_STRUCTURED_FIXTURES].reverse());
    for (const fx of ALL_STRUCTURED_FIXTURES) {
      expect(backward.get(fx.name)).toBe(forward.get(fx.name));
    }
  });

  test("fresh module registry: identical output under isolateModules", async () => {
    const baseline = await extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    let isolated: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("../structured-data") as typeof import("../structured-data");
      isolated = mod.extractStructuredData(COPPERSMITH_JSONLD_HTML, COPPER_CTX);
    });
    const isolatedEx = await isolated;
    expect(canon(isolatedEx)).toBe(canon(baseline));
  });

  test("two separate OS processes produce the same hash", () => {
    const repoRoot = process.cwd();
    const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const probe = path.join(
      repoRoot,
      "src",
      "fyd",
      "proceduralize",
      "__tests__",
      "support",
      "determinism-probe.ts",
    );
    const run = () =>
      execFileSync(process.execPath, [tsxCli, probe], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60000,
      }).trim();
    const h1 = run();
    const h2 = run();
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toBe(h1);
  });

  test("full pipeline: source order does not change the projected graph", async () => {
    const html: AcquiredSource = {
      url: "https://www.coppersmithplumbing.com/",
      sourceType: "html",
      discoveredAt: COPPER_CTX.observedAt,
      raw: COPPERSMITH_JSONLD_HTML,
      ok: true,
      status: 200,
    };
    const rss: AcquiredSource = {
      url: "https://www.coppersmithplumbing.com/feed/",
      sourceType: "rss",
      discoveredAt: COPPER_CTX.observedAt,
      raw: `<?xml version="1.0"?><rss version="2.0"><channel><title>Coppersmith Plumbing</title><item><title>Tip</title><guid>x1</guid></item></channel></rss>`,
      ok: true,
      status: 200,
    };
    const opts = {
      sourceUrl: COPPER_CTX.sourceUrl,
      observedAt: COPPER_CTX.observedAt,
      controllerId: "ctrl-test",
    };
    const a = await runExtractionPipeline([html, rss], opts);
    const b = await runExtractionPipeline([rss, html], opts);
    expect(canon(b.graph)).toBe(canon(a.graph));
    expect(canon(b.report)).toBe(canon(a.report));
  });
});
