/**
 * PROD-1 (2026-09-27): public-page chrome gate.
 *
 * The served public customer page (/sites/*, /o/*) must never render
 * owner/demo chrome, even with NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1
 * (Nolan's standing directive keeps the flag ON on :3100, so the flag
 * cannot be the fix). The gate is structural: public route trees contain
 * no owner-chrome mounts, and SiteClient's owner surfaces are opt-in
 * only.
 *
 * Static assertions on the source: if any of these fail, the public
 * page is serving owner chrome again.
 */
import * as fs from "fs";
import * as path from "path";

const REPO = "/home/nolan/projects/ping";

const read = (rel: string): string =>
  fs.readFileSync(path.join(REPO, rel), "utf8");

/**
 * Strip comments so the assertions test the component tree, not the
 * documentation. PROD-1 comments are allowed to name the strings they
 * forbid; the rendered tree must not contain them.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments: /* */ and {/* */}
    .replace(/(?<!:)\/\/[^\n]*/g, ""); // line comments: // (keeps https:// URLs)

const tree = (rel: string): string => stripComments(read(rel));

const PUBLIC_PAGES = [
  "src/app/sites/happy-place/page.tsx",
  "src/app/sites/coppersmith-plumbing/page.tsx",
];
const SITE_CLIENT = "src/app/sites/_shared/site-client.tsx";

describe("GATE-1: DemoOwnerMode never mounts on public routes", () => {
  for (const rel of PUBLIC_PAGES) {
    test(`${rel}: no DemoOwnerMode mount`, () => {
      const src = tree(rel);
      expect(src).not.toContain("DemoOwnerMode");
      expect(src).not.toContain("demo-owner-mode");
      expect(src).not.toContain("isDemoOwnerModeEnabled");
    });
  }
});

describe("GATE-2: customize console is owner-route-only", () => {
  test("SiteClient: no unconditional 'Customize this site'", () => {
    const src = tree(SITE_CLIENT);
    const gateIdx = src.indexOf("{ownerConsole ? (");
    const customizeIdx = src.indexOf("Customize this site");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(customizeIdx).toBeGreaterThan(0);
    // The only "Customize this site" occurrence renders inside the
    // ownerConsole gate.
    expect(gateIdx).toBeLessThan(customizeIdx);
    expect(src.indexOf("Customize this site", customizeIdx + 1)).toBe(-1);
  });

  test("SiteClient: ownerConsole defaults off", () => {
    const src = read(SITE_CLIENT);
    expect(src).toContain("ownerConsole = false");
  });

  test("public pages do not opt in to the owner console", () => {
    for (const rel of PUBLIC_PAGES) {
      const src = tree(rel);
      expect(src).not.toContain("ownerConsole");
    }
  });
});

describe("GATE-3: no demo labels in public site chrome", () => {
  test("SiteClient: no demo labels, first h1 is the business name", () => {
    const src = tree(SITE_CLIENT);
    expect(src).not.toContain("Generated site demo");
    expect(src).not.toContain("Procedural clone proof");
    expect(src).not.toContain('aria-label="Generated pages"');
    expect(src).toContain("<h1 className=\"text-xl font-bold\">{siteName}</h1>");
  });

  test("public pages pass the binding-verified business name", () => {
    for (const rel of PUBLIC_PAGES) {
      const src = read(rel);
      expect(src).toContain("resolveSiteDisplayName");
      expect(src).toContain("siteName={resolveSiteDisplayName(graph)}");
    }
  });
});

describe("PRESERVE: owner routes still work", () => {
  test("owner lab still mounts DemoOwnerMode", () => {
    const src = read("src/app/dev/objects/objects-lab-client.tsx");
    expect(src).toContain("<DemoOwnerMode");
  });

  test("DemoOwnerMode panel still renders its demo seam content", () => {
    const src = read("src/fyd/owner-mode/demo-owner-mode.tsx");
    expect(src).toContain("DEMO OWNER MODE - not real authentication");
    expect(src).toContain("CustomizePanel");
  });

  test("the demo-owner env gate is untouched", () => {
    const src = read("src/fyd/owner-mode/gate.ts");
    expect(src).toContain(
      'return process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE === "1";'
    );
  });
});
