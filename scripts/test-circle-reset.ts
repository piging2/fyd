/**
 * Circle-Only Product Reset regression invariants.
 * Usage: npx tsx scripts/test-circle-reset.ts
 *
 * Verifies the reset's structural guarantees without a browser:
 *  1. Happy Place and Coppersmith resolve through the SAME projection
 *     path (buildPortalProjection) with evidence-backed fields.
 *  2. No customer-specific branches in the Circle UI.
 *  3. No per-circle Ask UI remains; exactly one global assistant exists.
 *  4. Mobile has an inline-strip placement (no null-only dock).
 *  5. Experimental page routes are disabled at the router.
 *  6. Website hrefs are safe (https-only, no javascript:/data:).
 *
 * Exit 0 = all invariants hold. Any failure prints FAIL lines and exits 1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPortalProjection } from "../src/fyd/preview/pipeline";
import { isSafeWebHref } from "../src/fyd/preview/types";

const ROOT = join(__dirname, "..");
let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function src(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// --- 1. Same projection path, evidence-backed, both identities ---
const IDENTITIES = ["happy-place", "coppersmith-plumbing"] as const;
for (const siteId of IDENTITIES) {
  const p = buildPortalProjection(siteId);
  check(`${siteId}: projection resolves`, p !== null);
  if (!p) continue;
  const c = p.circle;
  check(`${siteId}: name is real`, c.name.trim().length > 1, c.name);
  check(`${siteId}: tagline is real`, c.tagline.trim().length > 10, c.tagline.slice(0, 40));
  check(`${siteId}: topFacts non-empty`, c.topFacts.length > 0 && c.topFacts.every((f) => f.trim().length > 0));
  check(`${siteId}: provenance label real`, c.provenanceLabel.trim().length > 5, c.provenanceLabel);
  const kinds = c.capabilities.map((k: unknown) =>
    typeof k === "string" ? k : (k as { kind?: string }).kind ?? "?",
  );
  for (const need of ["ask", "follow", "like"]) {
    check(`${siteId}: capability ${need}`, kinds.includes(need), kinds.join(","));
  }
  // --- 6. URL safety at the projection seam ---
  if (p.websiteHref) {
    check(`${siteId}: websiteHref safe`, isSafeWebHref(p.websiteHref), p.websiteHref);
    check(
      `${siteId}: websiteHref not javascript:/data:`,
      !/^\s*(javascript|data|blob|file):/i.test(p.websiteHref),
    );
  }
}

// --- 2. No customer-specific branches in Circle UI ---
for (const f of [
  "src/fyd/ui/portal-circle.tsx",
  "src/fyd/ui/portal-host.tsx",
  "src/fyd/ui/global-ask-dock.tsx",
  "src/fyd/ui/home-circles.tsx",
]) {
  const s = src(f).toLowerCase();
  const hit = ["happy-place", "happyplace", "coppersmith"].find((k) => s.includes(k));
  check(`${f}: no customer literals`, !hit, hit ?? "");
}

// --- 3. No per-circle Ask UI; exactly one global assistant ---
const circleSrc = src("src/fyd/ui/portal-circle.tsx");
check("portal-circle: no askOpen state", !circleSrc.includes("askOpen"));
check("portal-circle: no in-circle ask form", !/Ask FYD about/.test(circleSrc));
check("portal-circle: Ask FYD routes to global dock", circleSrc.includes("onAskRequest"));
check(
  "portal-circle: no submitAskCapability import",
  !circleSrc.includes("submitAskCapability"),
);
const dockUsers = ["src/app/page.tsx", "src/fyd/ui/home-circles.tsx"].filter((f) =>
  src(f).includes("GlobalAskDock"),
);
check("exactly one GlobalAskDock mount", dockUsers.length === 1, dockUsers.join(","));
const hostUsers = ["src/app/page.tsx"].filter((f) => src(f).includes("<PortalHost"));
check("page.tsx no longer mounts PortalHost directly", hostUsers.length === 0);
check("page.tsx mounts HomeCircles", src("src/app/page.tsx").includes("<HomeCircles"));

// --- 3b. Happy-Place-only rollout gate (Nolan, 2026-09-22) ---
const pageSrc = src("src/app/page.tsx");
check(
  "page.tsx builds circles from HOMEPAGE_CIRCLE_SITE_IDS",
  pageSrc.includes("HOMEPAGE_CIRCLE_SITE_IDS"),
);
check("page.tsx no longer enumerates all object ids", !pageSrc.includes("listObjectIds()"));
const pipelineSrc = src("src/fyd/preview/pipeline.ts");
check(
  "rollout gate lists exactly happy-place",
  /\bexport const HOMEPAGE_CIRCLE_SITE_IDS: string\[\] = \["happy-place"\]/.test(pipelineSrc),
);

// --- 4. Mobile inline strip exists; dock branch stays null ---
const hostSrc = src("src/fyd/ui/portal-host.tsx");
check("portal-host: inline strip for no-margin", hostSrc.includes("data-ping-inline-strip"));
check("portal-host: strip uses PortalCircle", /data-ping-inline-strip[\s\S]*PortalCircle/.test(hostSrc));
check("portal-host: fixed dock still null", hostSrc.includes("{docked.length > 0 ? null : null}"));

// --- 5. Experimental routes disabled at the router ---
const mw = src("src/middleware.ts");
for (const prefix of ["/objects", "/sites", "/build", "/portal-rail"]) {
  check(`middleware disables ${prefix}`, mw.includes(`"${prefix}"`), "prefix missing");
}
check("middleware disables /o pages", mw.includes('pathname === "/o"'));
check("middleware never touches /api/", mw.includes('!pathname.startsWith("/api/")'));
for (const kept of ["/node", "/embed", "/dev", "/fyd"]) {
  check(`middleware keeps ${kept} out of disabled list`, !mw.includes(`"${kept}"`), "must stay live");
}

// --- Live HTTP spot checks (soft: skipped if dev server unreachable) ---
async function liveChecks(): Promise<void> {
  const base = "http://localhost:3100";
  async function code(path: string): Promise<number | null> {
    try {
      const r = await fetch(base + path, { method: "GET", redirect: "manual" });
      await r.arrayBuffer().catch(() => null);
      return r.status;
    } catch {
      return null;
    }
  }
  const home = await code("/");
  if (home === null) {
    console.log("SKIP live HTTP checks (dev server unreachable)");
    return;
  }
  check("GET / -> 200", home === 200, String(home));
  for (const p of ["/objects", "/objects/spatial", "/sites/happy-place", "/o", "/portal-rail", "/build/x"]) {
    const c = await code(p);
    check(`GET ${p} -> 404`, c === 404, String(c));
  }
  const fyd = await code("/fyd");
  check("GET /fyd stays live", fyd === 200, String(fyd));
}

liveChecks().then(() => {
  console.log(failures === 0 ? "\nALL CIRCLE-RESET INVARIANTS HOLD" : `\n${failures} INVARIANT(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});
