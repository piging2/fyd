/**
 * The committed environment registry: every environment variable the
 * application reads, in one place, with its kind and purpose.
 *
 * This registry is data, not wiring: nothing at runtime consults it.
 * Its enforcement is the standing gate in
 * src/lib/__tests__/env-registry.test.ts, which censuses every
 * process.env read under src and fails when a read name is missing
 * here, or when a name registered here is no longer read anywhere.
 * Values are never recorded here; several entries are the subject of
 * the pending production env read, whose values land in their own
 * records when that read completes.
 */

export type EnvKind = "secret" | "config" | "path" | "url" | "flag";
export type EnvExposure = "server" | "public";

export interface EnvEntry {
  name: string;
  kind: EnvKind;
  exposure: EnvExposure;
  purpose: string;
}

export const ENV_REGISTRY: EnvEntry[] = [
  // FYD store directories and files (server paths; each store falls
  // back to a cwd-relative default when its variable is unset).
  { name: "FYD_OWNER_DIR", kind: "path", exposure: "server", purpose: "Owner record store directory." },
  { name: "FYD_PROJECTION_DIR", kind: "path", exposure: "server", purpose: "Tenant projection store directory." },
  { name: "FYD_OVERLAY_SNAPSHOT", kind: "path", exposure: "server", purpose: "Bundled overlay snapshot file the site reader falls back to." },
  { name: "FYD_EXPECTED_OVERLAY_JOURNAL", kind: "path", exposure: "server", purpose: "Expected overlay journal file for parity checks." },
  { name: "FYD_ADS_DIR", kind: "path", exposure: "server", purpose: "Ads record store directory." },
  { name: "FYD_CLAIM_DIR", kind: "path", exposure: "server", purpose: "Claim record store directory." },
  { name: "FYD_IDENTITY_DIR", kind: "path", exposure: "server", purpose: "Identity binding store directory." },
  { name: "FYD_FOLLOWS_DIR", kind: "path", exposure: "server", purpose: "Follows record store directory." },
  { name: "FYD_RELATIONSHIPS_DIR", kind: "path", exposure: "server", purpose: "Relationships record store directory." },
  { name: "FYD_ASSERTION_DIR", kind: "path", exposure: "server", purpose: "Owner correction ledger (assertions) directory." },
  { name: "FYD_LIKES_DIR", kind: "path", exposure: "server", purpose: "Likes record store directory." },
  { name: "FYD_INQUIRY_PRIVATE_DIR", kind: "path", exposure: "server", purpose: "Private inquiry ledger directory." },
  { name: "FYD_FEATURED_APPLICATION_PRIVATE_DIR", kind: "path", exposure: "server", purpose: "Private featured-application file store directory." },
  { name: "FYD_NOMINATION_PRIVATE_DIR", kind: "path", exposure: "server", purpose: "Private nomination file store directory." },
  { name: "FYD_ASSESSMENT_REQUEST_PRIVATE_DIR", kind: "path", exposure: "server", purpose: "Private assessment-request store directory." },
  { name: "FYD_QUOTE_JOURNEY_PRIVATE_DIR", kind: "path", exposure: "server", purpose: "Quote journey private record directory." },
  { name: "FYD_QUOTE_JOURNEY_JOURNAL_DIR", kind: "path", exposure: "server", purpose: "Quote journey journal directory." },
  { name: "FYD_JOURNAL_STORE", kind: "path", exposure: "server", purpose: "Journal event store location for the object reader." },
  { name: "FYD_JOURNAL_WRITE_TOKEN_FILE", kind: "path", exposure: "server", purpose: "File holding the journal write token, when file-sourced." },
  { name: "FYD_REPO_ROOT", kind: "path", exposure: "server", purpose: "Repository root for the projection regeneration trigger." },
  { name: "FYD_DEV_KEY_DIR", kind: "path", exposure: "server", purpose: "Development caller-key directory." },
  { name: "PING_DEV_KEY_DIR", kind: "path", exposure: "server", purpose: "Development key directory for PING gateway callers." },
  { name: "HOME", kind: "path", exposure: "server", purpose: "Process home directory, read for store and key resolution." },
  { name: "USERPROFILE", kind: "path", exposure: "server", purpose: "Windows profile directory, the HOME counterpart on that platform." },

  // Gateways and service URLs.
  { name: "FYD_JOURNAL_GATEWAY_URL", kind: "url", exposure: "server", purpose: "Journal gateway the site reader queries before the snapshot fallback." },
  { name: "FYD_CUSTOMIZE_GATEWAY_URL", kind: "url", exposure: "server", purpose: "Customize gateway base URL." },
  { name: "PING_GATEWAY_BASE_URL", kind: "url", exposure: "server", purpose: "PING gateway base URL for the object reader." },
  { name: "KV_REST_API_URL", kind: "url", exposure: "server", purpose: "Upstash KV REST endpoint." },
  { name: "KV_REST_API__KV_REST_API_URL", kind: "url", exposure: "server", purpose: "Upstash KV REST endpoint, Vercel integration injected name." },
  { name: "KV_REST_API__KV_URL", kind: "url", exposure: "server", purpose: "Upstash KV URL, Vercel integration injected name." },
  { name: "KV_REST_API__REDIS_URL", kind: "url", exposure: "server", purpose: "Redis URL, Vercel integration injected name." },
  { name: "VERCEL_URL", kind: "url", exposure: "server", purpose: "Deployment URL injected by Vercel, used to build absolute URLs." },

  // Secrets (values never recorded in this registry).
  { name: "KV_REST_API_TOKEN", kind: "secret", exposure: "server", purpose: "Upstash KV REST token." },
  { name: "KV_REST_API__KV_REST_API_TOKEN", kind: "secret", exposure: "server", purpose: "Upstash KV REST token, Vercel integration injected name." },
  { name: "KV_REST_API__KV_REST_API_READ_ONLY_TOKEN", kind: "secret", exposure: "server", purpose: "Upstash KV read-only token, Vercel integration injected name." },
  { name: "BLOB_READ_WRITE_TOKEN", kind: "secret", exposure: "server", purpose: "Vercel Blob read-write token; its presence configures the submission outbox." },
  { name: "FYD_SESSION_SECRET", kind: "secret", exposure: "server", purpose: "Session signing secret for FYD owner sessions." },
  { name: "FYD_JOURNAL_WRITE_TOKEN", kind: "secret", exposure: "server", purpose: "Token authorizing journal writes." },
  { name: "KIT_API_KEY", kind: "secret", exposure: "server", purpose: "Kit API key for subscriber and tag operations." },
  { name: "KIT_WEBHOOK_SECRET", kind: "secret", exposure: "server", purpose: "Kit webhook signature secret." },
  { name: "KIT_WEBHOOK_PREVIOUS_SECRET", kind: "secret", exposure: "server", purpose: "Previous Kit webhook secret, accepted during rotation." },
  { name: "GOOGLE_CLIENT_SECRET", kind: "secret", exposure: "server", purpose: "Google OAuth client secret." },
  { name: "GOOGLE_REFRESH_TOKEN", kind: "secret", exposure: "server", purpose: "Google OAuth refresh token for the connected account." },
  { name: "DIAGNOSTIC_SECRET", kind: "secret", exposure: "server", purpose: "Secret gating the diagnostics routes." },
  { name: "WORKBENCH_PASSWORD", kind: "secret", exposure: "server", purpose: "Workbench authority password checked by the health authority route." },
  { name: "ENCRYPTION_KEY", kind: "secret", exposure: "server", purpose: "Encryption key checked by the health authority route." },
  { name: "VERCEL_TOKEN", kind: "secret", exposure: "server", purpose: "Vercel API token for deployment tooling reads." },

  // Configuration and identifiers.
  { name: "GOOGLE_CLIENT_ID", kind: "config", exposure: "server", purpose: "Google OAuth client id." },
  { name: "GOOGLE_REDIRECT_URI", kind: "config", exposure: "server", purpose: "Google OAuth redirect URI." },
  { name: "GOOGLE_REVIEWS_SHEET_ID", kind: "config", exposure: "server", purpose: "Sheet holding the Google reviews import." },
  { name: "KIT_WEBSITE_SUBSCRIBER_TAG_ID", kind: "config", exposure: "server", purpose: "Kit tag id for website subscribers." },
  { name: "KIT_HOMEPAGE_SIGNUP_TAG_ID", kind: "config", exposure: "server", purpose: "Kit tag id for homepage signups." },
  { name: "KIT_ESTIMATE_REQUEST_TAG_ID", kind: "config", exposure: "server", purpose: "Kit tag id for estimate requests." },
  { name: "KIT_GUIDE_DOWNLOAD_TAG_ID", kind: "config", exposure: "server", purpose: "Kit tag id for guide downloads." },
  { name: "KIT_REVIEWER_TAG_ID", kind: "config", exposure: "server", purpose: "Kit tag id for reviewers." },
  { name: "KIT_WELCOME_SEQUENCE_ID", kind: "config", exposure: "server", purpose: "Kit welcome sequence id; deliberately unset in production (path (b), B-21)." },
  { name: "VERCEL_PROJECT_ID", kind: "config", exposure: "server", purpose: "Vercel project id for deployment tooling reads." },
  { name: "VERCEL_TEAM_ID", kind: "config", exposure: "server", purpose: "Vercel team id for deployment tooling reads." },
  { name: "VERCEL_GIT_COMMIT_SHA", kind: "config", exposure: "server", purpose: "Commit SHA injected by Vercel for the running deployment." },
  { name: "FYD_WRITE_BOUNDARY_STORE", kind: "config", exposure: "server", purpose: "Selects the write-boundary store implementation." },
  { name: "FYD_QUOTE_JOURNEY_SITES", kind: "config", exposure: "server", purpose: "Site list enabling the quote journey surface." },
  { name: "FYD_TEST_REGISTRY", kind: "config", exposure: "server", purpose: "Test registry selector for the isolated inquiry plane." },
  { name: "TEST_NAMESPACE", kind: "config", exposure: "server", purpose: "Namespace isolating test stores from production stores." },
  { name: "AP_PROBE_ACTOR", kind: "config", exposure: "server", purpose: "Actor for the ActivityPub probe roundtrip." },
  { name: "AP_PROBE_ACCT", kind: "config", exposure: "server", purpose: "Account for the ActivityPub probe roundtrip." },

  // Flags and platform modes.
  { name: "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE", kind: "flag", exposure: "public", purpose: "Enables the demo owner mode on fixture surfaces; production leaves it unset." },
  { name: "NEXT_PUBLIC_WORKBENCH_TARGET_ORIGIN", kind: "config", exposure: "public", purpose: "Workbench embed target origin." },
  { name: "NEXT_PUBLIC_WORKBENCH_ALLOWED_ORIGINS", kind: "config", exposure: "public", purpose: "Workbench embed allowed origins." },
  { name: "NEXT_PUBLIC_LENIS_DEBUG", kind: "flag", exposure: "public", purpose: "Enables Lenis scroll debugging in the browser." },
  { name: "FYD_DEV_OWNER_HOSTS", kind: "flag", exposure: "server", purpose: "Hosts treated as dev-owner hosts for gated surfaces." },
  { name: "FYD_ADS_LOOP_ENABLED", kind: "flag", exposure: "server", purpose: "Enables the ads loop; the FYD ads flag stands off." },
  { name: "DEV_MODE_SKIP_KV", kind: "flag", exposure: "server", purpose: "Development mode that skips KV access." },
  { name: "NODE_ENV", kind: "flag", exposure: "server", purpose: "Node environment mode supplied by the runtime." },
  { name: "NEXT_PHASE", kind: "flag", exposure: "server", purpose: "Next.js build and runtime phase supplied by the framework." },
  { name: "VERCEL", kind: "flag", exposure: "server", purpose: "Set by Vercel to mark a Vercel runtime." },
  { name: "VERCEL_ENV", kind: "flag", exposure: "server", purpose: "Vercel environment name (production, preview, development)." },
  { name: "CI", kind: "flag", exposure: "server", purpose: "Set by continuous integration runners." },
  { name: "GITHUB_ACTIONS", kind: "flag", exposure: "server", purpose: "Set by GitHub Actions runners." },
];

/**
 * Files permitted to access process.env dynamically (computed keys),
 * each with its reason. The gate test exempts exactly these files
 * from the literal-read census.
 */
export const ENV_DYNAMIC_ACCESS_FILES: Record<string, string> = {
  "src/lib/secrets/secret-broker.ts":
    "The secret broker resolves credential ids to environment variables by design; the id is the variable name.",
};
