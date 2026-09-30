/**
 * Deterministic per-location block extraction (location lane, 2026-09-30).
 *
 * The falsification battery's multi-location case (a /locations page
 * listing several stores, each with name + address + phone) produced
 * only the single body-contact address: repeated per-location blocks
 * were invisible to the graph. This module detects those blocks
 * deterministically from the source bytes and gives each a stable
 * synthetic entity id (location-block:<key>), following the
 * service-card precedent: parseRich emits location_block_* facts with
 * the synthetic entity id, and project() compiles them into
 * ping.social.location@1 objects with located_at edges. No new entity
 * machinery, no new relationship machinery.
 *
 * Design contract (deterministic when unambiguous, silent when not):
 * - A block is a structural container (div/section/article/li/aside/
 *   address) whose subtree text contains BOTH a full address (the
 *   body-contact ADDRESS_RE: house number + street suffix + city +
 *   ST + ZIP) AND a phone number (the body-contact PHONE_RE). The
 *   container kept is the MINIMAL one: an outer wrapper that contains
 *   a smaller address+phone container does not become its own block.
 * - Only REPEATED blocks are emitted: 2+ distinct addresses. A single
 *   location block is already covered by body-contact mining and the
 *   PostalAddress lane; emitting it here too would double-count the
 *   business's own address on every single-location site.
 * - One block per container: the first address and first phone in
 *   document order. A footer that lists all locations in one container
 *   yields one block (a conservative miss for the rest, documented,
 *   never a mis-paired phone).
 * - The block name is the container's first heading (h1-h6), verbatim,
 *   or "" when the block has no heading. Names are never invented.
 * - Blocks are deduped by normalized address (footer duplicates of a
 *   main-content block collapse to the first in document order).
 * - Block key: sha256-12 of the normalized address. Stable across
 *   runs; output sorted by key.
 * - Hostile-input posture, same as body-contact: comments, scripts,
 *   styles, and noscript are stripped before parsing. Pure: no I/O,
 *   no clock, no module state.
 */

import { parse, HTMLElement } from "node-html-parser";
import { createHash } from "node:crypto";
import { ADDRESS_RE, PHONE_RE } from "./body-contact";

export interface LocationBlock {
  /** Stable block key: sha256-12 of the normalized address. */
  key: string;
  /** Verbatim block name (first heading), or "" when none. */
  name: string;
  /** Verbatim address (first ADDRESS_RE match in the block). */
  address: string;
  /** Verbatim phone (first PHONE_RE match in the block). */
  phone: string;
  /** Evidence locator: detector + tag + ordinal + key. */
  evidenceDetail: string;
  /** The page URL the block was read from. */
  sourceUrl: string;
}

/** ParsedFact names this lane emits (shared with proceduralizer.ts). */
export const LOCATION_BLOCK_FACT_NAMES = {
  name: "location_block_name",
  address: "location_block_address",
  phone: "location_block_phone",
} as const;

/** Entity-id prefix for block facts: location-block:<key>. */
export const LOCATION_BLOCK_ENTITY_PREFIX = "location-block:";

/** Structural tags that may contain a location block. */
const CONTAINER_TAGS = "div,section,article,li,aside,address";

function sha12(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripHostile(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ");
}

/** Fresh global-flag instances: the shared ADDRESS_RE/PHONE_RE carry
 *  mutable lastIndex, so each scan gets its own copy. */
function freshAddressRe(): RegExp {
  return new RegExp(ADDRESS_RE.source, "g");
}

function freshPhoneRe(): RegExp {
  return new RegExp(PHONE_RE.source, "g");
}

interface ContainerHit {
  el: HTMLElement;
  address: string;
  phone: string;
}

/**
 * Extract repeated per-location blocks from HTML. Returns [] unless
 * 2+ distinct address+phone blocks are found.
 */
export function extractLocationBlocks(
  html: string,
  url: string,
): LocationBlock[] {
  const root = parse(stripHostile(html));
  const candidates = root.querySelectorAll(CONTAINER_TAGS);

  // Pass 1: containers whose subtree text holds an address AND a phone.
  const hits: ContainerHit[] = [];
  for (const el of candidates) {
    const text = el.text;
    const addressMatch = freshAddressRe().exec(text);
    if (!addressMatch) continue;
    const phoneMatch = freshPhoneRe().exec(text);
    if (!phoneMatch) continue;
    hits.push({ el, address: addressMatch[0], phone: phoneMatch[0] });
  }
  if (hits.length < 2) return [];

  // Pass 2: keep only minimal containers (drop an outer hit that
  // contains a smaller hit).
  const hitSet = new Set(hits.map((h) => h.el));
  const minimal = hits.filter((h) => {
    for (const desc of h.el.querySelectorAll(CONTAINER_TAGS)) {
      if (desc !== h.el && hitSet.has(desc)) return false;
    }
    return true;
  });
  if (minimal.length < 2) return [];

  // Pass 3: dedupe by normalized address (document order wins),
  // extract the block name from the first heading.
  const seen = new Set<string>();
  const blocks: LocationBlock[] = [];
  let ordinal = 0;
  for (const hit of minimal) {
    const norm = normalizeAddress(hit.address);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const heading = hit.el.querySelector("h1,h2,h3,h4,h5,h6");
    const name = heading ? cleanText(heading.text) : "";
    const key = sha12(norm);
    blocks.push({
      key,
      name,
      address: hit.address,
      phone: hit.phone,
      evidenceDetail:
        "detector=location-block tag=" +
        hit.el.tagName.toLowerCase() +
        " ordinal=" +
        ordinal +
        " key=" +
        key,
      sourceUrl: url,
    });
    ordinal++;
  }
  if (blocks.length < 2) return [];

  blocks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return blocks;
}
