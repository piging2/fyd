/**
 * Deterministic service derivation from a business description.
 *
 * Evidence class: DERIVED DETERMINISTIC. The service names come from the
 * business's own prose (the description field observed on the website), not
 * from structured Service objects. The basis is always labeled; it is never
 * collapsed with directly-structured evidence.
 *
 * Pure function: same description -> same list. No AI, no network.
 */

const LEAD_VERBS = [
  "building",
  "offering",
  "providing",
  "services include",
  "specializing in",
  "does",
  "doing",
];

/** Clauses that end the service list and start location/qualifier prose. */
const TRAILERS = [
  " across ",
  " serving ",
  " throughout ",
  " in benton",
  " in linn",
  " in marion",
  " in polk",
  " for ",
  " with ",
  " since ",
];

function titleCase(word: string): string {
  return word
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) || part.length === 0
        ? part
        : part[0].toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

export function slugifyService(name: string): string {
  return (
    "svc-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Parse a service list out of description prose.
 * Returns title-cased service names in observed order, deduplicated.
 */
export function deriveServicesFromDescription(description: string): string[] {
  if (!description) return [];
  const lower = description.toLowerCase();

  let start = -1;
  for (const verb of LEAD_VERBS) {
    const idx = lower.indexOf(verb);
    if (idx !== -1) {
      start = idx + verb.length;
      break;
    }
  }
  if (start === -1) return [];

  let segment = description.slice(start);
  const segLower = segment.toLowerCase();
  let end = segment.length;
  for (const trailer of TRAILERS) {
    const idx = segLower.indexOf(trailer);
    if (idx !== -1 && idx < end) end = idx;
  }
  segment = segment.slice(0, end);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of segment.split(",")) {
    // Split the final "and X" (Oxford or plain).
    const parts = raw.split(/\band\b/i);
    for (const part of parts) {
      const cleaned = part.replace(/[.;:()]+/g, "").trim();
      if (!cleaned) continue;
      // Guard: skip fragments that look like qualifiers, not services.
      if (/^(licensed|insured|local|family|oregon|colorado)\b/i.test(cleaned)) continue;
      if (cleaned.split(/\s+/).length > 4) continue;
      const name = titleCase(cleaned);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
