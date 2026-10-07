/**
 * Item 8 (fyd-execution) regression: INV-SC-1 client-island budget.
 *
 * A generated business page's server component tree MUST render identity,
 * business facts, services, locations, contact, static evidence-bound
 * content, navigation structure, and structured data with zero client
 * components of its own. Client components are permitted ONLY at the named
 * islands below. Any new "use client" file under src/app/sites/** or
 * src/fyd/components/** that is not on this allowlist fails the gate, as
 * does any "use client" module reachable from the visitor page entry that
 * is not a visitor island.
 *
 * Allowlist categories:
 * - VISITOR_ISLANDS: the only client modules permitted in the generated
 *   visitor page closure (Ask FYD, dialog enhancement).
 * - OWNER_BUILD_SURFACES: client modules that serve owner/build surfaces
 *   (never the visitor page); listed so the directory scan stays precise.
 * - SIBLING_LANE_OWNED: dirty files owned by sibling lanes (items 1-7);
 *   exempted with owner notes, not adopted.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

const VISITOR_ISLANDS = new Set([
  "src/fyd/components/visitor-islands.tsx",
  "src/fyd/components/ask-fyd-widget.tsx",
  "src/fyd/components/object-overlay.tsx",
]);

/**
 * Client modules that are not islands themselves but are direct
 * dependencies of the islands:
 * - why-this.tsx + evidence-state.tsx: the WhyThis drill-down rendered
 *   inside the object overlay.
 * - use-fyd-dialog.ts: the item-2 dialog primitive the overlay island
 *   coordinates through (balanced scroll ownership, focus return).
 * - lenis-provider.tsx: the Lenis scroll-lock provider the dialog
 *   primitive coordinates through (provided by the root layout).
 */
const ISLAND_DEPENDENCIES = new Set([
  "src/fyd/ui/why-this.tsx",
  "src/fyd/ui/evidence-state.tsx",
  "src/fyd/ui/use-fyd-dialog.ts",
  "src/components/lenis-provider.tsx",
]);

const OWNER_BUILD_SURFACES = new Set([
  "src/app/sites/_shared/site-editor-client.tsx",
  // Next.js framework: error boundaries must be client components. This is
  // framework surface, not a FYD island.
  "src/app/sites/error.tsx",
  "src/fyd/components/hero-section.tsx",
  "src/fyd/components/viewport.tsx",
  "src/fyd/components/fyd-motion-fallback.tsx",
]);

const SIBLING_LANE_OWNED = new Set([
  // Thin client fork; the entry-point composition fix (render the server
  // tree from the page and pass islands as children) belongs to its lane.
  "src/app/sites/_shared/site-client.tsx",
  // Worker C (items 6-7) dirty.
  "src/fyd/components/object-rail.tsx",
]);

const ALLOWLIST = new Set([
  ...VISITOR_ISLANDS,
  ...ISLAND_DEPENDENCIES,
  ...OWNER_BUILD_SURFACES,
  ...SIBLING_LANE_OWNED,
]);

function isClientModule(file: string): boolean {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    return t === '"use client";' || t === "'use client';";
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

test("every 'use client' file under sites/components is an allowlisted island", () => {
  const files = [
    ...walk(path.join(ROOT, "src", "app", "sites")),
    ...walk(path.join(ROOT, "src", "fyd", "components")),
  ];
  const offenders = files
    .filter(isClientModule)
    .map(rel)
    .filter((f) => !ALLOWLIST.has(f));
  expect(offenders).toEqual([]);
});

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // external package
  const candidates = [base, base + ".tsx", base + ".ts", base + ".jsx", base + ".js"];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function importSpecs(src: string): string[] {
  // Static VALUE imports only. Dynamic import() (next/dynamic
  // code-splitting, e.g. the owner console) is a separate chunk, not part
  // of the initial visitor hydration closure, so it is not followed here.
  // `import type` is erased at compile time and contributes nothing to
  // the bundle, so it is skipped too.
  const out: string[] = [];
  const re =
    /(?:import(?!\s+type\b)[^'"]*from\s*["']([^"']+)["']|export(?!\s+type\b)[^'"]*from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Transitive module closure of the visitor page entry. */
function visitorClosure(): Set<string> {
  const entry = path.join(ROOT, "src", "app", "sites", "_shared", "site-client.tsx");
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let src: string;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const spec of importSpecs(src)) {
      const r = resolveImport(f, spec);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

test("visitor page client closure contains only the named islands", () => {
  const closure = visitorClosure();
  expect(closure.size).toBeGreaterThan(5); // the walk actually resolved
  const entry = rel(path.join(ROOT, "src", "app", "sites", "_shared", "site-client.tsx"));
  const allowed = new Set([...VISITOR_ISLANDS, ...ISLAND_DEPENDENCIES]);
  const offenders = [...closure]
    .filter(isClientModule)
    .map(rel)
    .filter((f) => f !== entry && !allowed.has(f));
  expect(offenders).toEqual([]);
});
