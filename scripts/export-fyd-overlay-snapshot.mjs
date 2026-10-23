#!/usr/bin/env node
/**
 * Export a bundled FYD overlay snapshot from the real FYD journal gateway.
 *
 * Usage:
 *   node scripts/export-fyd-overlay-snapshot.mjs [output-path]
 *
 * Reads the gateway base from FYD_JOURNAL_GATEWAY_URL
 * (default http://127.0.0.1:18199), fetches FYD_SITE_OVERLAY events for
 * every known tenant, and writes { exportedAt, source, tenants, events }
 * to fyd-projections/fyd-overlay-snapshot.json (or argv[2] when given).
 * That file is the default fallback read by
 * PingObjectReader.readOverlaySnapshotList on deployments (e.g. Vercel)
 * where the journal gateway is unreachable.
 *
 * A partial snapshot is never written: any tenant failure exits nonzero
 * and leaves the output untouched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const TENANTS = ["happy-place", "coppersmith-plumbing", "ping-fyd"];

const gatewayBase = (
  process.env.FYD_JOURNAL_GATEWAY_URL && process.env.FYD_JOURNAL_GATEWAY_URL.trim()
    ? process.env.FYD_JOURNAL_GATEWAY_URL.trim()
    : "http://127.0.0.1:18199"
).replace(/\/+$/, "");

const outputArg = process.argv[2];
const outputPath = outputArg
  ? isAbsolute(outputArg)
    ? outputArg
    : join(process.cwd(), outputArg)
  : join(process.cwd(), "fyd-projections", "fyd-overlay-snapshot.json");

function eventsFrom(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.events)) return data.events;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
  }
  return null;
}

async function main() {
  const allEvents = [];
  for (const tenant of TENANTS) {
    const url = `${gatewayBase}/events/${encodeURIComponent("FYD_SITE_OVERLAY")}?tenant=${encodeURIComponent(tenant)}`;
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (err) {
      console.error(`export: tenant "${tenant}": fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`export: tenant "${tenant}": gateway returned HTTP ${res.status}`);
      process.exit(1);
    }
    const data = await res.json().catch(() => null);
    const events = eventsFrom(data);
    if (!events) {
      console.error(`export: tenant "${tenant}": unexpected response shape (no events list)`);
      process.exit(1);
    }
    console.log(`export: tenant "${tenant}": ${events.length} events`);
    allEvents.push(...events);
  }

  const snapshot = {
    exportedAt: new Date().toISOString(),
    source: gatewayBase,
    tenants: [...TENANTS],
    events: allEvents,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`export: total ${allEvents.length} events`);
  console.log(`export: wrote ${outputPath}`);
}

await main();
