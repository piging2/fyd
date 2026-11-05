/**
 * tenant-t1-accent-text.test.ts — pins Website UI audit 2026-11-01
 * finding T1 (slice c59fe67) against main's architecture.
 *
 * The finding: the tenant accent (default #C9A227 gold) used as small
 * text measures 2.42:1 on white, far under the WCAG AA 4.5:1 floor.
 * Main resolved the split as Item 4 (2026-10-07): the accentText role
 * is DERIVED by resolveThemeRoles (>=4.5:1 on surface for any palette)
 * and deliberately NOT stored in DEFAULT_FYD_THEME (pinned by
 * validator-contrast.test.ts), so the slice's stored-token form cannot
 * land here. What this pin guards instead:
 *
 * 1. The renderer keeps its two small-text usages (card kicker, person
 *    role) on roles.accentText.
 * 2. ObjectRail's heading — the residual raw-accent small-text binding
 *    the slice never covered (12px uppercase on the surface) — binds
 *    the derived role too.
 * 3. No tenant component or site surface binds raw accent as a text
 *    color ever again (decoration and accentForeground pairings are
 *    unaffected: the scan only matches a bare `theme.accent` in a
 *    color position).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ObjectRail } from "../object-rail";
import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import type { ObjectPresence } from "../../sitespec/types";
import { resolveThemeRoles } from "../../sitespec/theme-roles";

const RAIL_PRESENCE: ObjectPresence = {
  mode: "rail",
  objects: ["a"],
  rules: { collapseBelow: "lg" },
};

describe("tenant audit T1: accent as small text", () => {
  test("the derived role differs from the raw accent (it had to move to clear AA)", () => {
    const roles = resolveThemeRoles(DEFAULT_FYD_THEME);
    expect(roles.accentText.toLowerCase()).not.toBe(
      DEFAULT_FYD_THEME.accent.toLowerCase(),
    );
  });

  test("ObjectRail heading binds the derived accentText role, never raw accent", () => {
    const roles = resolveThemeRoles(DEFAULT_FYD_THEME);
    const html = renderToStaticMarkup(
      createElement(ObjectRail, {
        cards: createElement("div", null, "card"),
        presence: RAIL_PRESENCE,
        theme: DEFAULT_FYD_THEME,
        heading: "Explore",
      }),
    );
    expect(html).toContain("Explore");
    const lower = html.toLowerCase();
    expect(lower).toContain("color:" + roles.accentText.toLowerCase());
    expect(lower).not.toContain(
      "color:" + DEFAULT_FYD_THEME.accent.toLowerCase(),
    );
  });

  test("renderer keeps its two small-text usages on the accentText role", () => {
    const renderer = readFileSync(join(__dirname, "..", "renderer.tsx"), "utf8");
    const uses = renderer.match(/color: roles\.accentText/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  test("no tenant component or site surface binds raw accent as a text color", () => {
    const rawAccentText = /color:\s*theme\.accent(?![A-Za-z])/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(name)) {
          if (rawAccentText.test(readFileSync(p, "utf8"))) offenders.push(p);
        }
      }
    };
    walk(join(__dirname, "..")); // src/fyd/components
    walk(join(__dirname, "..", "..", "..", "app", "sites")); // src/app/sites
    expect(offenders).toEqual([]);
  });
});
