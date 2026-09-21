/**
 * fyd/onboarding: the anonymous URL -> preview service (order G).
 *
 * The ONLY anonymous entry point that performs network I/O. Every fetch
 * goes through the fyd/net abuse boundary (gate, SSRF-safe fetch, crawl
 * budget, origin semaphore, dedup cache). Typing a URL leaves an OBSERVED
 * claim record and nothing else.
 */
export * from "./extractor";
export * from "./anonymous-preview";
