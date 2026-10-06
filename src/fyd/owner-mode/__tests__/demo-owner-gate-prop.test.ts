
/**
 * Hydration #418 regression (2026-09-25, Nolan directive: option B).
 *
 * The demo-owner gate MUST be resolved server-side exactly once and passed
 * down as a prop. The client component must never independently read
 * environment state: NEXT_PUBLIC_* is inlined into the client bundle at
 * build time while the server reads it at request time, and any skew is a
 * guaranteed hydration mismatch (minified React #418).
 *
 * These tests pin:
 * 1. The client initial render depends ONLY on the enabled prop, never on
 *    the environment (server initial state == client hydration initial state).
 * 2. The client component source contains no independent env read for the
 *    gate decision (structural guard against reintroduction).
 * 3. The server-side resolver still behaves (env "1" -> true, else false).
 */

import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { DemoOwnerMode } from "../demo-owner-mode";
import { isDemoOwnerModeEnabled } from "../gate";

const ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";

function withEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env[ENV_VAR];
  try {
    if (value === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = value;
    fn();
  } finally {
    if (prev === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = prev;
  }
}

function render(enabled: boolean): string {
  return renderToString(
    React.createElement(DemoOwnerMode, { siteId: "happy-place", enabled }),
  );
}

describe("demo-owner gate: server-resolved prop (hydration #418)", () => {
  test("enabled=false renders nothing even when the env var is set", () => {
    withEnv("1", () => {
      expect(render(false)).toBe("");
    });
  });

  test("enabled=false renders nothing when the env var is absent", () => {
    withEnv(undefined, () => {
      expect(render(false)).toBe("");
    });
  });

  test("enabled=true renders the banner even when the env var is ABSENT (no independent client env read)", () => {
    withEnv(undefined, () => {
      const html = render(true);
      expect(html).toContain("DEMO OWNER MODE");
    });
  });

  test("enabled=true renders the banner when the env var is set (prop wins, env irrelevant)", () => {
    withEnv("1", () => {
      const html = render(true);
      expect(html).toContain("DEMO OWNER MODE");
    });
  });

  test("client component source has no independent env read for the gate", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "demo-owner-mode.tsx"),
      "utf-8",
    );
    expect(src).not.toContain("isDemoOwnerModeEnabled");
    expect(src).not.toContain("process.env");
  });

  test("server resolver: env 1 -> true, otherwise false", () => {
    withEnv("1", () => expect(isDemoOwnerModeEnabled()).toBe(true));
    withEnv("0", () => expect(isDemoOwnerModeEnabled()).toBe(false));
    withEnv(undefined, () => expect(isDemoOwnerModeEnabled()).toBe(false));
  });
});
