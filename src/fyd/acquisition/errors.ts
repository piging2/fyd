/**
 * FYD live acquisition: typed failure taxonomy.
 *
 * Split out of live-loop.ts so the static adapter and the loop share one
 * vocabulary without a circular import. These codes are the fail-closed
 * contract: hostile or unusable input ALWAYS terminates with one of these,
 * never with an uncaught exception and never with a silent empty result.
 */

/** Typed terminal failure codes for the live acquisition loop. */
export type AcquisitionFailureCode =
  | "ACQ_INVALID_URL"
  | "ACQ_SCHEME_REJECTED"
  | "ACQ_CREDENTIAL_URL"
  | "ACQ_PRIVATE_IP"
  | "ACQ_DNS_FAILED"
  | "ACQ_HTTP_STATUS"
  | "ACQ_REDIRECT_LOOP"
  | "ACQ_CONTENT_TYPE_REJECTED"
  | "ACQ_TOO_LARGE"
  | "ACQ_TIMEOUT"
  | "ACQ_NETWORK_ERROR"
  | "ACQ_ROBOTS_DISALLOWED"
  | "ACQ_EMPTY_CONTENT"
  | "ACQ_NO_GRAPH"
  | "ACQ_VERIFY_FAILED"
  | "ACQ_PLAN_FAILED"
  | "MEDIA_RIGHTS_SCOPE";

export type LoopStageName =
  | "discover"
  | "acquire"
  | "understand"
  | "resolve"
  | "generate"
  | "media";

/**
 * Typed failure. Thrown, never returned as a value, so a refusal can never
 * be mistaken for a usable result.
 */
export class LiveAcquisitionError extends Error {
  readonly code: AcquisitionFailureCode;
  readonly stage: LoopStageName;
  constructor(code: AcquisitionFailureCode, stage: LoopStageName, message: string) {
    super(message);
    this.name = "LiveAcquisitionError";
    this.code = code;
    this.stage = stage;
  }
}

/**
 * Map a safe-fetch reason string to a typed failure code. Deterministic
 * prefix matching over the reasons safe-fetch.ts emits; the fallback is
 * ACQ_NETWORK_ERROR (fail closed, never an unknown code).
 */
export function classifyFetchFailure(reason: string): AcquisitionFailureCode {
  const r = reason;
  if (r.startsWith("URL rejected: Not a parseable URL")) return "ACQ_INVALID_URL";
  if (r.startsWith("URL rejected: Scheme not allowed")) return "ACQ_SCHEME_REJECTED";
  if (r.startsWith("URL rejected: Credential-bearing")) return "ACQ_CREDENTIAL_URL";
  if (r.startsWith("DNS rejected: IP literal is not public") || r.includes("resolves to non-public"))
    return "ACQ_PRIVATE_IP";
  if (r.startsWith("DNS rejected:")) return "ACQ_DNS_FAILED";
  if (/^Fetch failed:.*(timeout|timed out|abort)/i.test(r)) return "ACQ_TIMEOUT";
  if (r.startsWith("Fetch failed:")) return "ACQ_NETWORK_ERROR";
  if (/^HTTP \d+/.test(r)) return "ACQ_HTTP_STATUS";
  if (r.startsWith("Content-type not allowed")) return "ACQ_CONTENT_TYPE_REJECTED";
  if (r.includes("size limit") || r.includes("exceeds limit") || r.includes("Exceeded size")) return "ACQ_TOO_LARGE";
  if (r.startsWith("Too many redirects")) return "ACQ_REDIRECT_LOOP";
  return "ACQ_NETWORK_ERROR";
}
