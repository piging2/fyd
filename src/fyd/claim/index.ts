/**
 * fyd/claim: the resource-claim flow (onboarding order J).
 *
 * A FYD website is a RESOURCE CLAIM, not a login provider. Typing a URL is
 * not proof of ownership: OBSERVED (public evidence) != CLAIMED
 * (authenticated identity asserts control) != VERIFIED-CONTROLLED (a
 * verification proof exists). The verification seam stays extensible;
 * only operator-attestation is implemented today.
 */
export * from "./types";
export * from "./machine";
export * from "./verification-seam";
export * from "./identity";
export * from "./store";
export * from "./resource-id";
