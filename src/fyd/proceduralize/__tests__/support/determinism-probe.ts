/**
 * Cross-process determinism probe: runs the Coppersmith JSON-LD shape
 * through the extraction pipeline in a FRESH node process and prints the
 * sha256 of the canonical output. The hostile determinism test spawns
 * this twice; identical hashes prove object identity does not depend on
 * module history, process lifetime, or import order.
 */
import { createHash } from "node:crypto";
import { extractStructuredData } from "../../structured-data";
import { COPPERSMITH_JSONLD_HTML } from "../../__fixtures__/coppersmith-jsonld";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const rec = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(rec)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(rec[k]))
      .join(",") +
    "}"
  );
}

async function main(): Promise<void> {
  const ex = await extractStructuredData(COPPERSMITH_JSONLD_HTML, {
    sourceUrl: "https://www.coppersmithplumbing.com/",
    observedAt: "2026-09-21T12:01:10.844Z",
  });
  process.stdout.write(createHash("sha256").update(stable(ex)).digest("hex") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
