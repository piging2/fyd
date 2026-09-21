/**
 * Boundary enforcement tests: the template/data boundary as executable law.
 *
 * - Shared infrastructure (components, UI primitives, wiring, boundary,
 *   the shared site client) must not import customer data paths and must
 *   not hardcode customer business names. No customer facts baked into
 *   shared components.
 * - Customer data (fixtures) must not import presentation modules.
 *   No FYD infrastructure leaking into the customer data layer.
 * - Test files are exempt: tests legitimately load fixtures.
 * - The customer package round-trips: separate -> export -> import, and
 *   rejects non-package input.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  boundaryStatement,
  exportCustomerData,
  importCustomerData,
  separateCustomerData,
  type SiteBundleInput,
} from "../data-boundary";

const ROOT = path.resolve(__dirname, "../../..");

const SHARED_DIRS = [
  "src/fyd/components",
  "src/fyd/ui",
  "src/fyd/wiring",
  "src/fyd/boundary",
  "src/app/sites/_shared",
];

const CUSTOMER_PATH_MARKERS = ["__fixtures__", "sites/happy-place", "sites/coppersmith-plumbing"];
const CUSTOMER_NAME_MARKERS = ["happy place", "coppersmith"];
const PRESENTATION_MARKERS = ["fyd/components/", "fyd/ui/"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function isTestFile(p: string): boolean {
  return p.includes("__tests__") || p.endsWith(".test.ts") || p.endsWith(".test.tsx");
}

describe("template/data boundary", () => {
  test("shared infrastructure never imports customer data paths", () => {
    const violations: string[] = [];
    for (const dir of SHARED_DIRS) {
      for (const f of sourceFiles(dir)) {
        if (isTestFile(f)) continue;
        const src = fs.readFileSync(f, "utf8");
        for (const marker of CUSTOMER_PATH_MARKERS) {
          if (src.includes(marker)) violations.push(`${path.relative(ROOT, f)} imports "${marker}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("shared infrastructure never hardcodes customer business names", () => {
    const violations: string[] = [];
    for (const dir of SHARED_DIRS) {
      for (const f of sourceFiles(dir)) {
        if (isTestFile(f)) continue;
        const src = fs.readFileSync(f, "utf8").toLowerCase();
        for (const marker of CUSTOMER_NAME_MARKERS) {
          if (src.includes(marker)) violations.push(`${path.relative(ROOT, f)} mentions "${marker}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("customer data never imports presentation modules", () => {
    const violations: string[] = [];
    for (const f of sourceFiles("src/fyd/proceduralize/__fixtures__")) {
      if (isTestFile(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const marker of PRESENTATION_MARKERS) {
        if (src.includes(marker)) violations.push(`${path.relative(ROOT, f)} imports "${marker}"`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("customer data package", () => {
  const input: SiteBundleInput = {
    identity: { name: "Example", siteId: "example", sourceUrl: "https://example.com" },
    facts: { phone: "+13035550100" },
    media: { items: [] },
    content: { tagline: "Example tagline" },
    objectGraph: { objects: [] },
    siteSpec: { pages: [] },
    ownerOverrides: { visibility: {} },
    evidenceHistory: { observations: [] },
  };

  test("separate -> export -> import round-trips", () => {
    const pkg = separateCustomerData(input);
    expect(pkg.format).toBe("fyd.customer-data@1");
    const json = exportCustomerData(pkg);
    const back = importCustomerData(json);
    expect(back.objectGraph).toEqual({ objects: [] });
    expect(back.identity.name).toBe("Example");
    expect(back.media).toEqual({ items: [] });
  });

  test("import rejects non-packages", () => {
    expect(() => importCustomerData("{}")).toThrow(/not a customer data package/i);
    expect(() => importCustomerData(JSON.stringify({ format: "fyd.customer-data@1" }))).toThrow(
      /missing/i,
    );
  });

  test("the boundary statement names both sides", () => {
    const s = boundaryStatement();
    expect(s).toMatch(/service provider/i);
    expect(s).toMatch(/exportable/);
  });
});
