/**
 * Claim store (server-only). Claims are DURABLE, evidence-bearing state:
 * one JSON file per resource under data/fyd-claims/<resourceId>.json,
 * separate from source state. Source re-ingestion never touches this
 * directory, so it can never erase a claim.
 *
 * Writes are atomic (tmp file + rename). Reads fail honest: a missing or
 * invalid file yields null, never invented state.
 *
 * FYD_CLAIM_DIR env override exists so tests can use a temp directory.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ClaimError, type ClaimState, type ResourceClaim } from "./types";
import { isValidResourceId } from "./machine";

const CLAIM_STATES: ReadonlySet<string> = new Set([
  "observed",
  "claimed",
  "verified-controlled",
]);

function claimDir(): string {
  const override = process.env.FYD_CLAIM_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-claims");
}

function claimPath(resourceId: string): string {
  if (!isValidResourceId(resourceId)) {
    throw new ClaimError("Invalid resource id.", "invalid-resource-id");
  }
  return join(claimDir(), resourceId + ".json");
}

function isValidClaim(v: unknown): v is ResourceClaim {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const state: unknown = r.state;
  return (
    r.version === 1 &&
    typeof r.resourceId === "string" &&
    r.kind === "fyd-site" &&
    typeof state === "string" &&
    CLAIM_STATES.has(state as ClaimState) &&
    (r.sourceUrl === null || typeof r.sourceUrl === "string") &&
    typeof r.observedAt === "string" &&
    (r.claimedBy === null || typeof r.claimedBy === "object") &&
    (r.verification === null || typeof r.verification === "object") &&
    Array.isArray(r.history)
  );
}

/** Read a claim record; null when missing, invalid, or corrupt. Never invents state. */
export function readClaim(resourceId: string): ResourceClaim | null {
  try {
    const path = claimPath(resourceId);
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isValidClaim(parsed) || parsed.resourceId !== resourceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Atomic, validated write. */
export function writeClaim(claim: ResourceClaim): void {
  if (!isValidClaim(claim)) {
    throw new ClaimError("Refusing to write an invalid claim record.", "invalid-claim");
  }
  const path = claimPath(claim.resourceId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp-" + process.pid;
  writeFileSync(tmp, JSON.stringify(claim, null, 2), "utf8");
  renameSync(tmp, path);
}

export function claimExists(resourceId: string): boolean {
  return readClaim(resourceId) !== null;
}
