/**
 * tenant-t9-tap-targets.test.ts — pins Website UI audit 2026-11-01
 * finding T9 (renderer half).
 *
 * The finding: several tenant-facing controls sat under 44px
 * outside the global mobile media query that rescued them — the
 * Locations pills and Links chips in the renderer at px-4 py-2
 * (~36px). The public shell (VisitorExperience nav) and the Ask
 * widget already carry their own 44px minimums; the two renderer
 * controls were the residual and now carry explicit min-h-[44px].
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const renderer = readFileSync(join(__dirname, "..", "renderer.tsx"), "utf8");
const askWidget = readFileSync(
  join(__dirname, "..", "ask-fyd-widget.tsx"),
  "utf8",
);

describe("tenant audit T9: secondary controls carry explicit 44px minimums", () => {
  test("Locations pills and Links chips are min-h-[44px]", () => {
    expect(renderer).toContain(
      "inline-flex min-h-[44px] items-center rounded-full border border-border-soft px-4 py-2",
    );
    expect(renderer).toContain(
      "inline-flex min-h-[44px] items-center border px-4 py-2",
    );
    expect(renderer).not.toContain(
      'className="inline-block rounded-full border border-border-soft px-4 py-2',
    );
    expect(renderer).not.toContain(
      'className="inline-block border px-4 py-2',
    );
  });

  test("Ask widget documents and renders the same 44px floor", () => {
    expect(askWidget).not.toContain("toggle at least 24px");
    expect(askWidget).toContain("min-h-[44px] cursor-pointer");
  });
});
