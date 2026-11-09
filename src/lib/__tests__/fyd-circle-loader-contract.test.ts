import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The FYD Circle loader is the network's public face on publisher sites.
 * Its product property is lightness: one small framework-free file that
 * fails closed. This contract keeps that property suite-enforced, so a
 * future edit cannot quietly grow the loader or wire a framework into it.
 */
const LOADER = join(process.cwd(), "public", "fyd-circle-loader.js");
const BYTE_BUDGET = 4096;

describe("fyd-circle-loader publisher contract", () => {
  const source = readFileSync(LOADER, "utf8");

  it("stays under its byte budget", () => {
    expect(statSync(LOADER).size).toBeLessThanOrEqual(BYTE_BUDGET);
  });

  it("carries no framework fingerprints", () => {
    // Scan executable code only: the header comment legitimately names the
    // React component the full Circle lives in. Framework usage is what
    // this contract forbids in the loader itself.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const marker of ["ReactDOM", "React.createElement", "createApp(", "angular.module", "__NEXT_DATA__", "webpack", "jQuery", "require("]) {
      expect(code).not.toContain(marker);
    }
  });

  it("exposes the mount API and fails closed", () => {
    expect(source).toContain("FydCircle");
    expect(source).toContain("mount");
    expect(source.toLowerCase()).toContain("catch");
  });
});
