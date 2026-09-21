/**
 * FYD AcquisitionAdapter: raw URL in, typed observations out.
 *
 * Types only. No implementation in this module. The adapter is the only FYD
 * component that touches the network, and its contract is:
 *
 *   L0 policy gate -> L1 static HTTP fast path -> L2 bounded browser-rendered
 *   fallback (only on typed L1 insufficiency) -> L3 bounded discovery
 *   (sitemap/RSS/internal links, page budget) -> L4 AI interpretation only
 *   after deterministic extraction is exhausted, on observations only.
 *
 * Full design, egress/privacy policy, version investigation, and component
 * decisions: src/fyd/proceduralize/ACQUISITION-STACK.md
 *
 * An implementation must be a separate, reviewable commit and must prove the
 * egress policy (allowed domains, no credentialed URLs, no internal network,
 * content-size caps, timeout budget) with tests before fetching anything real.
 */

export type AcquisitionLevel = 0 | 1 | 2 | 3;

export interface AcquisitionRequest {
  /** Seed URL. Must pass L0 policy checks. */
  url: string;
  /** Extra registrable domains allowed beyond the seed's own domain. */
  allowedDomains: string[];
  /** Why we are acquiring; recorded on every observation for audit. */
  purpose: string;
  /** Allow multi-page discovery (L3). Default false: seed page only. */
  allowDiscovery: boolean;
  /** Max pages including the seed, when allowDiscovery is true. */
  pageBudget: number;
  /** Max link-follow depth from the seed. */
  maxDepth: number;
}

export interface AcquisitionPolicy {
  maxBodyBytes: number;
  timeoutMs: number;
  acquisitionTimeoutMs: number;
  maxRedirects: number;
  /** Always true in production. */
  blockPrivateNetworks: boolean;
  /** Always true in production; no public off switch. */
  requireRobotsTxt: boolean;
  /** Identifies FYD, e.g. "FYD-SocialBot/1.0 (+https://...)". */
  userAgent: string;
  rateLimitPerDomainMs: number;
  allowedContentTypes: string[];
  /** L2 per-page wall-clock budget. */
  browserWallClockMs: number;
}

export interface AcquiredLink {
  href: string;
  absoluteUrl: string;
  rel: string | null;
  anchorText: string;
  internal: boolean;
}

export interface AcquiredObservation {
  url: string;
  /** After redirects. */
  finalUrl: string;
  /** ISO 8601. */
  fetchedAt: string;
  statusCode: number;
  contentType: string;
  bytes: number;
  truncated: boolean;
  levelUsed: AcquisitionLevel;
  /** 0 for the seed. */
  depth: number;
  title: string | null;
  meta: Record<string, string>;
  openGraph: Record<string, string>;
  jsonLd: unknown[];
  canonicalUrl: string | null;
  links: AcquiredLink[];
  /**
   * Notes the adapter must surface: robots directives seen, blocks detected,
   * consent dismissed, truncation, policy downgrades. Never silently empty.
   */
  policyNotes: string[];
  /** Hash of the raw bytes, so downstream evidence can prove what was seen. */
  evidenceHash: string;
  /** Typed record of any escalation that happened (or was considered). */
  escalation: { from: AcquisitionLevel; to: AcquisitionLevel; reason: string }[];
}

export interface PolicyDecision {
  allowed: boolean;
  /** Always set when blocked. */
  reason: string;
  normalizedUrl: string | null;
}

export interface AcquisitionAdapter {
  /** L0 gate, also usable standalone by the scheduler. */
  checkPolicy(url: string, allowedDomains: string[]): Promise<PolicyDecision>;
  /** Run the escalation pipeline; one observation per acquired page. */
  acquire(
    request: AcquisitionRequest,
    policy: AcquisitionPolicy
  ): Promise<AcquiredObservation[]>;
}
