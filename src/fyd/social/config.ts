/**
 * FYD social backend config. SERVER ONLY.
 *
 * FYD consumes PING's existing social operations over HTTP; this module only
 * resolves where the PING gateway lives and where FYD's dev signing keys are
 * kept. No social state is configured here; every number FYD renders is read
 * from the gateway at request time.
 *
 * Defaults are sprint-demo conveniences for the Pig dev server. They are
 * overridden by environment in any other deployment. They are config, not
 * fake state: no follower counts, follow states, or activity are defaulted.
 */
export function fydGatewayBaseUrl(): string {
  const fromEnv =
    process.env.FYD_PING_GATEWAY_BASE_URL || process.env.PING_GATEWAY_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // Sprint demo default: repo-booted PING gateway on the Pig (see h2-proof).
  return "http://127.0.0.1:18199";
}

export function fydDevKeyDir(): string {
  return process.env.FYD_DEV_KEY_DIR || "/home/nolan/.fyd-dev-keys";
}
