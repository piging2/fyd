/**
 * GET /api/mc/factory
 *
 * Mission Control factory/goals/ingestion projection, served from the
 * read-only snapshot produced by ~/workspace/mc-projections/mc_factory.py
 * and staged at data/factory-projection/factory-state.json.
 *
 * The snapshot is a PROJECTION: it displays recorded state (EP2 board,
 * EP3 production text, goals tree, ingestion freshness) with its source
 * and watermark per section. It never authorizes anything. A missing or
 * unreadable snapshot renders UNKNOWN, never invented values.
 *
 * Added 2026-10-18 by PING-PROJECTION-20261018. Serves after the next
 * :3100 rebuild; the static copy at public/projections/factory-state.json
 * carries the same bytes.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SNAPSHOT = path.join(
  process.cwd(),
  "data",
  "factory-projection",
  "factory-state.json"
);

export async function GET() {
  try {
    const raw = await readFile(SNAPSHOT, "utf-8");
    const snapshot = JSON.parse(raw);
    return NextResponse.json({
      status: "PROVEN",
      source: "data/factory-projection/factory-state.json",
      snapshot,
    });
  } catch {
    return NextResponse.json(
      {
        status: "UNKNOWN",
        reason: "factory projection snapshot unreadable",
        snapshot: null,
      },
      { status: 503 }
    );
  }
}
