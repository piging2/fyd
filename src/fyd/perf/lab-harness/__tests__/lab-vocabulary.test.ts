/**
 * Item 11 (fyd-execution) regression: INV-PM-2 lab != field.
 *
 * Lab numbers are never presented as field/p75 performance in reports,
 * tests, or harness docs. This test scans the harness directory for
 * field-performance vocabulary used as a CLAIM. Talking about what we do
 * NOT do ("never p75", "not field performance") is allowed; presenting
 * lab numbers AS p75/CrUX/real-user/RUM is not.
 */

import * as fs from "fs";
import * as path from "path";

const HARNESS = path.resolve(__dirname, "..");

// Claim patterns: the lab number presented as field performance.
const CLAIM_RES = [
  /\blab\b[^.\n]{0,80}\b(is|are)\b[^.\n]{0,40}\bp75\b/i,
  /\bp75\b[^.\n]{0,60}\b(field|real-user|crux)\b[^.\n]{0,40}\b(performance|measurement)\b/i,
  /represents?\s+(field|real-user)\s+performance/i,
  /\bcrux\b[^.\n]{0,40}\b(data|performance)\b/i,
];

// Negation guard: a line that explicitly disavows the claim is not a claim.
const NEGATION_RE = /\b(never|not|no\b|isn't|aren't|don't|doesn't|neither)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|cjs|mjs|sh|md|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("no harness file presents lab numbers as field performance", () => {
  const offenders: string[] = [];
  for (const file of walk(HARNESS)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (NEGATION_RE.test(line)) return;
      for (const re of CLAIM_RES) {
        if (re.test(line)) {
          offenders.push(`${path.relative(HARNESS, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }
  expect(offenders).toEqual([]);
});
