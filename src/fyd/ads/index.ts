/**
 * src/fyd/ads/: the FYD objects economic loop module (v1).
 * Lane B1 surface: policy constants, the pinned disclosure copy, the
 * shared append-only event log, and the campaign + inventory/consent
 * stores. Lane B2 adds the event ledger behind this barrel. Lane B3
 * adds the placement-decision store and the matching provider.
 * Lane B4 adds the render seam and the collector core (the client
 * components, collector-client and loop-composition, are imported
 * by path and stay out of this server barrel).
 */

export * from "./policy";
export * from "./disclosure";
export * from "./event-log";
export * from "./campaign-store";
export * from "./inventory-store";
export * from "./opt-in";
export * from "./event-ledger";
export * from "./decision-store";
export * from "./provider";
export * from "./render";
export * from "./collector";
