/**
 * fyd/net: the canonical network boundary for FYD.
 *
 * safe-fetch.ts is the ONE SSRF gate every server-side fetch of a
 * user/agent-supplied URL must pass through. budgets.ts and rate-limit.ts
 * are the tiny anonymous-generation abuse boundary (order G): crawl/page
 * budget, concurrency budget, per-origin dedupe/cache, server-side quotas.
 */
export * from "./safe-fetch";
export * from "./budgets";
export * from "./rate-limit";
