/**
 * Owner intent interpreter: deterministic plain language -> typed
 * OwnerCommand. No AI, no network. Only the documented shapes act; anything
 * else returns null so the surface can answer it as evidence Q&A.
 */

import { knownServices } from "./view";
import type { OwnerCommand } from "./types";

function findServiceId(needle: string, known: Map<string, string>): string | null {
  const n = needle.trim().toLowerCase();
  for (const [id, name] of known) {
    const ln = name.toLowerCase();
    if (ln === n || ln.startsWith(n) || n.startsWith(ln)) return id;
  }
  return null;
}

export interface TextProposal {
  command: OwnerCommand;
  summary: string;
}

/**
 * Interprets one line of owner intent. Returns a typed proposal or null
 * when the text is not an understood command. Never mutates anything.
 */
export function interpretTextCommand(text: string, objectId: string): TextProposal | null {
  const { names } = knownServices(objectId);
  const lower = text.trim().toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = lower.match(/^put\s+(.+?)\s+first$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    return {
      command: { type: "move-service", id, to: "first" },
      summary: `Move ${names.get(id)} to the top of the services list.`,
    };
  }
  if ((m = lower.match(/^put\s+(.+?)\s+last$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    return {
      command: { type: "move-service", id, to: "last" },
      summary: `Move ${names.get(id)} to the end of the services list.`,
    };
  }
  if ((m = lower.match(/^move\s+(.+?)\s+(up|down)$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    const dir = m[2] as "up" | "down";
    return {
      command: { type: "move-service", id, to: dir },
      summary: `Move ${names.get(id)} one step ${dir} in the services list.`,
    };
  }
  // Address presentation decision (SHOW/HIDE): placed BEFORE the service
  // hide/show so "hide the address" is not consumed as an unknown
  // service name. the pipeline never owns it;
  // the owner asserts it persistently. A local presentation change, so it
  // rides the fast proposal/undo tier.
  if (
    lower.match(
      /^(?:hide|remove)\s+(?:the\s+)?(?:business\s+)?address$|^make\s+(?:the\s+)?(?:business\s+)?address\s+private$|^make\s+private\s+(?:the\s+)?(?:business\s+)?address$/,
    )
  ) {
    return {
      command: { type: "set-address-visibility", visibility: "hidden" },
      summary:
        "Hide the business address from the public page. The address itself is unchanged.",
    };
  }
  if (
    lower.match(
      /^(?:show|display|publish)\s+(?:the\s+)?(?:business\s+)?address$|^make\s+(?:the\s+)?(?:business\s+)?address\s+public$|^make\s+public\s+(?:the\s+)?(?:business\s+)?address$/,
    )
  ) {
    return {
      command: { type: "set-address-visibility", visibility: "public" },
      summary:
        "Show the business address on the public page. The address itself is unchanged.",
    };
  }
  if ((m = lower.match(/^(hide|show)\s+(.+)$/))) {
    const id = findServiceId(m[2], names);
    if (!id) return null;
    const visible = m[1] === "show";
    return {
      command: { type: "set-service-visibility", id, visible },
      summary: visible
        ? `Show ${names.get(id)} on the public page.`
        : `Hide ${names.get(id)} from the public page.`,
    };
  }
  if ((m = lower.match(/^add\s+(.+)$/))) {
    const name = m[1].trim();
    if (!name) return null;
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      command: { type: "add-service", name: pretty },
      summary: `Add "${pretty}" to the services list.`,
    };
  }
  // CONFIRM verb: the owner asserts the current effective value of a contact
  // field is correct. Records an owner assertion (actor + timestamp) without
  // changing any value. Bare phrasings with no field ("that's right", "correct")
  // are ambiguous and return null so the surface can answer them as Q&A.
  // Placed BEFORE the correction patterns so "my phone is correct" is not
  // misread as a correction to the value "correct".
  if ((m = lower.match(/^(?:confirm|verify)\s+(?:(?:the|our|my)\s+)?(phone|email|website)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if ((m = lower.match(/^(?:(?:our|my|the)\s+)?(phone|email|website)\s+is\s+(?:correct|right|accurate)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if (
    (m = lower.match(
      /^(?:that's right|yes,?\s+that's (?:right|correct|accurate)),?\s+(?:my|our|the)\s+(phone|email|website)$/,
    ))
  ) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if (
    (m = lower.match(/^(?:correct|right|accurate),?\s+(?:my|our|the)\s+(phone|email|website)$/))
  ) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  // Owner contact corrections. The summary names what the owner asserts;
  // the approval path records the source's current value alongside it, so
  // the correction is always SOURCE SAYS X / OWNER SAYS Y, never a silent
  // overwrite.
  if ((m = lower.match(/^(?:correct|change|update|set)\s+(phone|email|website)\s+to\s+(.+)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    const value = m[2].trim();
    if (!value) return null;
    return {
      command: { type: "set-contact-field", field, value },
      summary: `Record an owner correction for ${field}: "${value}". The site's current ${field} stays recorded as what the source says.`,
    };
  }
  if ((m = lower.match(/^(?:our|my|the)\s+(phone|email|website)\s+is\s+(.+)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    const value = m[2].trim();
    if (!value) return null;
    return {
      command: { type: "set-contact-field", field, value },
      summary: `Record an owner correction for ${field}: "${value}". The site's current ${field} stays recorded as what the source says.`,
    };
  }
  if ((m = lower.match(/^(?:revert|undo|remove)\s+(?:the\s+)?(phone|email|website)\s+correction$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "revert-contact-field", field },
      summary: `Revert the owner correction for ${field}; the site's ${field} is shown again.`,
    };
  }
  return null;
}

/**
 * Consequence tier of an owner command, per the AUTHORITY GRADIENT
 * (FYD-24H-BUILDER-DECISIONS 2026-09-22): authority stays invisible until
 * consequence requires it.
 *
 * - "presentation": LOCAL PRESENTATION CHANGE (reorder, show/hide). Fast
 *   proposal/undo: the propose/approve loop still binds the proposal to its
 *   base digests (the proven safety property), but the approve response
 *   carries a ready-to-approve `undo` for one-step reversal. No public
 *   fact is altered.
 * - "factual": PUBLIC FACTUAL CHANGE (correct, confirm, add). Explicit
 *   confirmation: the full propose -> digest-bound approve loop, and the
 *   approval records an owner assertion (actor + timestamp). The source
 *   record is never rewritten.
 *
 * The switch is exhaustive over the OwnerCommand union on purpose: adding
 * a command type forces its tier to be classified here. A future command
 * that writes to an external provider, moves money, sends a message, or
 * is otherwise irreversible does NOT belong in "presentation" or the
 * plain "factual" lane: it needs capability + confirmation or strong
 * approval, which this tier function must refuse to grant silently.
 */
export type CommandConsequenceTier = "presentation" | "factual";

export function commandConsequenceTier(cmd: OwnerCommand): CommandConsequenceTier {
  switch (cmd.type) {
    case "move-service":
    case "set-service-visibility":
    case "set-address-visibility":
      return "presentation";
    case "set-contact-field":
    case "revert-contact-field":
    case "confirm-contact-field":
    case "add-service":
      return "factual";
  }
}

/**
 * The exact inverse of a presentation-tier command, for fast undo. The
 * route's approve response carries the inverse pre-bound to post-apply
 * digests, so the owner can reverse a local presentation change in one
 * approve call. Returns null for commands with no exact single-command
 * inverse (all factual-tier commands): factual assertions are superseded
 * by newer assertions, not inverted.
 */
export function invertOwnerCommand(cmd: OwnerCommand): OwnerCommand | null {
  switch (cmd.type) {
    case "move-service": {
      const to =
        cmd.to === "first" ? "last" : cmd.to === "last" ? "first" : cmd.to === "up" ? "down" : "up";
      return { type: "move-service", id: cmd.id, to };
    }
    case "set-service-visibility":
      return { type: "set-service-visibility", id: cmd.id, visible: !cmd.visible };
    case "set-address-visibility":
      return {
        type: "set-address-visibility",
        visibility: cmd.visibility === "hidden" ? "public" : "hidden",
      };
    default:
      return null;
  }
}

/**
 * One-line human summary of a command, for undo affordances. `serviceNames`
 * maps service id -> display name (unknown ids fall back to the id).
 */
export function describeCommand(
  cmd: OwnerCommand,
  serviceNames: Map<string, string>,
): string {
  const name = (id: string): string => serviceNames.get(id) ?? id;
  switch (cmd.type) {
    case "move-service": {
      const where =
        cmd.to === "first"
          ? "back to the top"
          : cmd.to === "last"
            ? "back to the bottom"
            : cmd.to === "up"
              ? "one step up"
              : "one step down";
      return "Undo: move " + name(cmd.id) + " " + where + ".";
    }
    case "set-service-visibility":
      return cmd.visible
        ? "Undo: show " + name(cmd.id) + " again."
        : "Undo: hide " + name(cmd.id) + " again.";
    case "set-address-visibility":
      return cmd.visibility === "hidden"
        ? "Undo: hide the business address again."
        : "Undo: show the business address again.";
    case "set-contact-field":
      return "Record an owner correction for " + cmd.field + '.';
    case "revert-contact-field":
      return "Revert the owner correction for " + cmd.field + ".";
    case "confirm-contact-field":
      return "Confirm the " + cmd.field + " is correct.";
    case "add-service":
      return "Add service " + cmd.name + ".";
  }
}
