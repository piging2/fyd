/**
 * Deterministic, opaque resource ids for claimed URLs.
 *
 * claimResourceIdForUrl("https://Example.com:443/about") === "url-<16 hex>":
 * the id is derived from the normalized origin only, so different pages on
 * the same site claim the same resource. The id reveals nothing about the
 * URL beyond the digest; the source URL is stored separately in the claim.
 */
import { createHash } from "node:crypto";
import { ClaimError } from "./types";

export function claimResourceIdForUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ClaimError("Not a parseable URL.", "invalid-url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ClaimError("Only http(s) URLs can become claimable resources.", "invalid-url");
  }
  const origin =
    u.protocol + "//" + u.hostname.toLowerCase() + (u.port ? ":" + u.port : "");
  const digest = createHash("sha256").update(origin).digest("hex").slice(0, 16);
  return "url-" + digest;
}
