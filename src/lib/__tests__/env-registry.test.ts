import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ENV_DYNAMIC_ACCESS_FILES, ENV_REGISTRY } from "../env-registry";

/**
 * Standing gate: the committed environment registry
 * (src/lib/env-registry.ts) must name every environment variable
 * read anywhere under src, and every registered name must still be
 * read somewhere. A new process.env read without a registry entry
 * fails this suite, as does a registry entry whose reads are gone.
 *
 * The census reads literal process.env.NAME accesses with line
 * comments stripped. Files listed in ENV_DYNAMIC_ACCESS_FILES are
 * exempt because they resolve variables by computed key on purpose;
 * this suite also asserts every exemption still exists and is used.
 */

const SRC_ROOT = join(process.cwd(), "src");
const SELF = "src/lib/__tests__/env-registry.test.ts";
const REGISTRY_FILE = "src/lib/env-registry.ts";

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
}

function censusReads(): Map<string, Set<string>> {
  const files: string[] = [];
  walk(SRC_ROOT, files);
  const reads = new Map<string, Set<string>>();
  for (const file of files) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    if (rel === SELF || rel === REGISTRY_FILE) continue;
    if (rel in ENV_DYNAMIC_ACCESS_FILES) continue;
    const text = readFileSync(file, "utf8")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        return at === -1 ? line : line.slice(0, at);
      })
      .join("\n");
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
      const name = match[1];
      if (!reads.has(name)) reads.set(name, new Set());
      reads.get(name)!.add(rel);
    }
  }
  return reads;
}

describe("environment registry standing gate", () => {
  const reads = censusReads();
  const registered = new Map(ENV_REGISTRY.map((e) => [e.name, e]));

  it("registers every environment variable read under src", () => {
    const missing = [...reads.keys()].filter((n) => !registered.has(n));
    expect(missing).toEqual([]);
  });

  it("keeps no registry entry whose reads are gone", () => {
    const stale = ENV_REGISTRY.map((e) => e.name).filter((n) => !reads.has(n));
    expect(stale).toEqual([]);
  });

  it("has no duplicate registry entries", () => {
    expect(registered.size).toBe(ENV_REGISTRY.length);
  });

  it("records a kind, exposure, and purpose for every entry", () => {
    for (const entry of ENV_REGISTRY) {
      expect(["secret", "config", "path", "url", "flag"]).toContain(entry.kind);
      expect(["server", "public"]).toContain(entry.exposure);
      expect(entry.purpose.length).toBeGreaterThan(10);
      if (entry.name.startsWith("NEXT_PUBLIC_")) {
        expect(entry.exposure).toBe("public");
      } else {
        expect(entry.exposure).toBe("server");
      }
      if (entry.kind === "secret") {
        expect(entry.exposure).toBe("server");
      }
    }
  });

  it("keeps every dynamic-access exemption real and purposeful", () => {
    for (const [file, reason] of Object.entries(ENV_DYNAMIC_ACCESS_FILES)) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text).toContain("process.env[");
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
