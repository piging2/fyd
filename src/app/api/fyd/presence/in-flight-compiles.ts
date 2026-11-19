/**
 * In-flight compile slots for POST /api/fyd/presence (hardening D9-F1).
 *
 * This counter lives outside the route module on purpose, for the same
 * reason the build route's counter lives in in-flight-builds.ts: a
 * Next.js route module may export only its handlers and route config.
 * The route acquires and releases slots through here; the admission
 * suite reads the count through inFlightCompileCountForTests.
 *
 * It is a sibling of the build route's counter, not a share of it: the
 * build cap (MAX_IN_FLIGHT_BUILDS) protects the build route's own
 * admission contract, and counting presence compiles against it would
 * silently change that route's proven behavior. Each heavy route holds
 * its own small cap; the shared abuse boundary is the AnonymousGate.
 */

let inFlightCompiles = 0;

/** Compiles currently holding an in-flight slot. */
export function inFlightCompileCount(): number {
  return inFlightCompiles;
}

/** Take one in-flight slot. Callers check the cap first. */
export function acquireInFlightCompile(): void {
  inFlightCompiles += 1;
}

/** Free one in-flight slot. Callers guard against double release. */
export function releaseInFlightCompile(): void {
  inFlightCompiles -= 1;
}

/** Test introspection: compiles currently holding an in-flight slot. */
export function inFlightCompileCountForTests(): number {
  return inFlightCompiles;
}
