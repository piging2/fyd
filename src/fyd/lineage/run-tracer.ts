/**
 * LANE-LIN tracer CLI.
 * Usage: npx tsx --import ./src/fyd/lineage/register-css.mjs \
 *   src/fyd/lineage/run-tracer.ts --site <id> --claim "..." --question "..."
 */
import { traceClaim } from "./tracer";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const siteId = arg("--site");
const claim = arg("--claim");
const question = arg("--question");
if (!siteId || !claim || !question) {
  console.error(
    "usage: run-tracer.ts --site <siteId> --claim <rendered claim> --question <ask question>",
  );
  process.exit(2);
}
const chain = traceClaim(siteId, claim, question);
process.stdout.write(JSON.stringify(chain, null, 2) + "\n");
