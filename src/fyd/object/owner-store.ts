/**
 * Owner state store (server-only).
 *
 * Owner decisions are DURABLE state, not generated cache. They live in
 * data/fyd-owner/<objectId>.json, one file per object, completely separate
 * from source state (fixtures, manifests). Source re-ingestion reads and
 * writes only source state; it can never erase owner intent.
 *
 * The store is APPEND-ONLY (see ./owner-events.ts): every command appends
 * one provenance-backed event to the object's log, and the returned state
 * is the pure projection over that log. Reverting a contact correction
 * appends an owner.restored-fact event; the correction event stays in the
 * log. There is no mutable owner map anymore.
 *
 * applyOwnerCommand / parseOwnerCommand keep their public API so the
 * routes and UI keep working; they are adapters over the event log now.
 *
 * All commands fail closed: unknown ids, bad shapes, and empty names are
 * rejected with a typed error and nothing is written.
 *
 * FYD_OWNER_DIR env override exists so tests can use a temp directory.
 */

import type {
  FieldConfirmation,
  OwnerCommand,
  OwnerOverrides,
} from "./types";
import type { OwnerFieldCorrection } from "../../lib/ping/types";
import {
  ADDRESS_TARGET,
  CONTACT_FIELD_TARGETS,
  SERVICE_ORDER_TARGET,
  appendOwnerEvent,
  projectOwnerState,
  serviceTarget,
  type OwnerEventActor,
  type OwnerEventDraft,
  type OwnerEventEvidence,
} from "./owner-events";
import { slugifyService } from "./services";

export class OwnerCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerCommandError";
  }
}

/** Contact fields the owner may correct. Labels are human-facing. */
export const CORRECTABLE_FIELDS = ["phone", "email", "website"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

const FIELD_LABELS: Record<CorrectableField, string> = {
  phone: "Phone",
  email: "Email",
  website: "Website",
};

function isCorrectableField(v: unknown): v is CorrectableField {
  return (
    typeof v === "string" &&
    (CORRECTABLE_FIELDS as readonly string[]).includes(v)
  );
}

/** Normalize owner-typed values: trim, collapse inner whitespace. */
function normalizeFieldValue(field: CorrectableField, value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Validate a corrected contact value. Fail closed: a correction that does
 * not look like its field is rejected and nothing is written.
 */
function validateFieldValue(field: CorrectableField, value: string): void {
  if (field === "phone") {
    const digits = value.replace(/[\s\-().]/g, "");
    if (!/^\+?\d{7,15}$/.test(digits)) {
      throw new OwnerCommandError(
        "That does not look like a phone number (7-15 digits, optional leading +).",
      );
    }
    return;
  }
  if (field === "email") {
    if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 120) {
      throw new OwnerCommandError("That does not look like an email address.");
    }
    return;
  }
  // website
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new OwnerCommandError("Website must be an http(s) URL.");
    }
  } catch (err) {
    if (err instanceof OwnerCommandError) throw err;
    throw new OwnerCommandError("That does not look like a website URL.");
  }
}

/**
 * Current owner-visible state for an object: the projection over its
 * event log. Files written by the old mutable store are migrated
 * transparently on read (see ./owner-events.ts).
 */
export function readOverrides(objectId: string): OwnerOverrides {
  return projectOwnerState(objectId);
}

/**
 * Whether the source has drifted since the owner confirmed a field.
 * Derived per read, never persisted (same semantics as the correction
 * drift flag in owner-overlay.ts): the confirmed value still wins; drift
 * only flags that the source moved under the confirmation. Seam-local
 * primitive for the read pipeline to compose after digest verification.
 */
export function confirmationSourceDrifted(
  confirmation: FieldConfirmation,
  currentSourceValue: string | null,
): boolean {
  return currentSourceValue !== confirmation.sourceValue;
}

/**
 * Apply one owner command. `knownServiceIds` is the current full derived +
 * added id set; commands referencing unknown ids are rejected.
 * `opts.sourceValue` / `opts.actorLabel` are used by contact-field
 * corrections: the source's value at correction time (so the SOURCE SAYS
 * X half of the record is never lost) and the authority label the
 * correction is recorded under (demo: the seeded demo actor label).
 *
 * The command is translated to one event draft, validated against the
 * projected state, then appended. Nothing is written on validation
 * failure. Returns the projected state after the append (also persisted).
 */
export interface ApplyCommandOpts {
  sourceValue?: string | null;
  actorLabel?: string;
}

function demoActor(label?: string): OwnerEventActor {
  return {
    kind: "demo",
    label: label ?? "Demo Owner (seeded, unverified)",
  };
}

function sourceSnapshotEvidence(sourceValue: string | null): OwnerEventEvidence {
  return {
    kind: "source-snapshot",
    ref: "projection:raw",
    detail:
      sourceValue === null
        ? "the source listed no value at correction time"
        : "the source listed '" + sourceValue + "' at correction time",
  };
}

export function applyOwnerCommand(
  objectId: string,
  cmd: OwnerCommand,
  knownServiceIds: string[],
  knownServiceNames: Map<string, string>,
  opts?: ApplyCommandOpts,
): OwnerOverrides {
  const current = readOverrides(objectId);
  const known = new Set(knownServiceIds);
  const at = new Date().toISOString();
  const actor = demoActor(opts?.actorLabel);

  let draft: OwnerEventDraft;
  switch (cmd.type) {
    case "move-service": {
      if (!known.has(cmd.id)) throw new OwnerCommandError("Unknown service.");
      // Materialize the current order: owner order first, then any new ids.
      const order = [...current.serviceOrder.filter((id) => known.has(id))];
      for (const id of knownServiceIds) if (!order.includes(id)) order.push(id);
      const idx = order.indexOf(cmd.id);
      order.splice(idx, 1);
      if (cmd.to === "first") order.unshift(cmd.id);
      else if (cmd.to === "last") order.push(cmd.id);
      else if (cmd.to === "up") order.splice(Math.max(0, idx - 1), 0, cmd.id);
      else order.splice(Math.min(order.length, idx + 1), 0, cmd.id);
      const name = knownServiceNames.get(cmd.id) ?? cmd.id;
      draft = {
        at,
        objectId,
        type: "owner.corrected-fact",
        actor,
        target: SERVICE_ORDER_TARGET,
        previousBasis: current.serviceOrder,
        newValue: order,
        evidence: {
          kind: "owner-attestation",
          ref: "command:move-service",
          detail: "owner moved '" + name + "' " + cmd.to,
        },
        note:
          "Moved " +
          name +
          " " +
          (cmd.to === "first"
            ? "to the top"
            : cmd.to === "last"
              ? "to the bottom"
              : cmd.to) +
          ".",
        generator: "fyd-owner@1",
      };
      break;
    }
    case "set-service-visibility": {
      if (!known.has(cmd.id)) throw new OwnerCommandError("Unknown service.");
      const name = knownServiceNames.get(cmd.id) ?? cmd.id;
      const hidden = current.hiddenServices.includes(cmd.id);
      if (cmd.visible) {
        if (hidden) {
          draft = {
            at,
            objectId,
            type: "owner.restored-fact",
            actor,
            target: serviceTarget(cmd.id),
            previousBasis: { hidden: true },
            newValue: { hidden: false },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-service-visibility",
              detail: "owner re-showed '" + name + "'",
            },
            note: "Showed " + name + ".",
            generator: "fyd-owner@1",
          };
        } else {
          draft = {
            at,
            objectId,
            type: "owner.confirmed-fact",
            actor,
            target: serviceTarget(cmd.id),
            previousBasis: { hidden: false },
            newValue: { hidden: false },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-service-visibility",
              detail: "'" + name + "' was already visible; confirmed",
            },
            note: name + " is already shown; confirmed.",
            generator: "fyd-owner@1",
          };
        }
      } else {
        if (hidden) {
          draft = {
            at,
            objectId,
            type: "owner.confirmed-fact",
            actor,
            target: serviceTarget(cmd.id),
            previousBasis: { hidden: true },
            newValue: { hidden: true },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-service-visibility",
              detail: "'" + name + "' was already hidden; confirmed",
            },
            note: name + " is already hidden; confirmed.",
            generator: "fyd-owner@1",
          };
        } else {
          draft = {
            at,
            objectId,
            type: "owner.hid-fact",
            actor,
            target: serviceTarget(cmd.id),
            previousBasis: { hidden: false },
            newValue: { hidden: true },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-service-visibility",
              detail: "owner hid '" + name + "'",
            },
            note: "Hid " + name + ".",
            generator: "fyd-owner@1",
          };
        }
      }
      break;
    }
    case "add-service": {
      const name = cmd.name.trim().replace(/\s+/g, " ");
      if (!name || name.length > 60)
        throw new OwnerCommandError("Service name must be 1-60 characters.");
      const id = slugifyService(name);
      if (
        known.has(id) ||
        current.addedServices.some((s) => s.id === id)
      ) {
        throw new OwnerCommandError("That service already exists.");
      }
      draft = {
        at,
        objectId,
        type: "owner.added-fact",
        actor,
        target: serviceTarget(id),
        previousBasis: null,
        newValue: { id, name },
        evidence: {
          kind: "owner-attestation",
          ref: "command:add-service",
          detail: "owner added service '" + name + "'",
        },
        note: "Added " + name + ".",
        generator: "fyd-owner@1",
      };
      break;
    }
    case "set-address-visibility": {
      if (cmd.visibility !== "public" && cmd.visibility !== "hidden") {
        throw new OwnerCommandError("Visibility must be public or hidden.");
      }
      const hidden = current.addressVisibility === "hidden";
      if (cmd.visibility === "hidden") {
        if (hidden) {
          draft = {
            at,
            objectId,
            type: "owner.confirmed-fact",
            actor,
            target: ADDRESS_TARGET,
            previousBasis: { visibility: "hidden" },
            newValue: { visibility: "hidden" },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-address-visibility",
              detail: "address was already hidden; confirmed",
            },
            note: "The address is already hidden; confirmed.",
            generator: "fyd-owner@1",
          };
        } else {
          draft = {
            at,
            objectId,
            type: "owner.hid-fact",
            actor,
            target: ADDRESS_TARGET,
            previousBasis: { visibility: "public" },
            newValue: { hidden: true },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-address-visibility",
              detail: "owner hid the street address",
            },
            note: "Hid the street address.",
            generator: "fyd-owner@1",
          };
        }
      } else {
        if (!hidden) {
          draft = {
            at,
            objectId,
            type: "owner.confirmed-fact",
            actor,
            target: ADDRESS_TARGET,
            previousBasis: { visibility: "public" },
            newValue: { visibility: "public" },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-address-visibility",
              detail: "address was already public; confirmed",
            },
            note: "The address is already public; confirmed.",
            generator: "fyd-owner@1",
          };
        } else {
          draft = {
            at,
            objectId,
            type: "owner.restored-fact",
            actor,
            target: ADDRESS_TARGET,
            previousBasis: { hidden: true },
            newValue: { hidden: false },
            evidence: {
              kind: "owner-attestation",
              ref: "command:set-address-visibility",
              detail: "owner made the address public again",
            },
            note: "Made the address public.",
            generator: "fyd-owner@1",
          };
        }
      }
      break;
    }
    case "set-contact-field": {
      // The owner attests a corrected contact value. The source record is
      // NOT rewritten: the correction is stored as its own event with the
      // source's value at this moment preserved as previous basis. The
      // read model composes ownerValue over the source at serve time.
      if (!isCorrectableField(cmd.field))
        throw new OwnerCommandError("Unknown contact field.");
      const value = normalizeFieldValue(cmd.field, cmd.value);
      if (!value) throw new OwnerCommandError("A value is required.");
      validateFieldValue(cmd.field, value);
      const label = FIELD_LABELS[cmd.field];
      const sourceValue = opts?.sourceValue ?? null;
      const prior = current.fieldCorrections[cmd.field]?.ownerValue ?? null;
      if (prior === value) {
        // Nothing changed: record a confirmation, not a redundant correction.
        draft = {
          at,
          objectId,
          type: "owner.confirmed-fact",
          actor,
          target: CONTACT_FIELD_TARGETS[cmd.field],
          previousBasis: { ownerValue: prior, sourceValue },
          newValue: { ownerValue: value },
          evidence: sourceSnapshotEvidence(sourceValue),
          note: "Confirmed " + label + ": the owner says " + value + " (no change).",
          generator: "fyd-owner@1",
        };
        break;
      }
      const correction: OwnerFieldCorrection = {
        field: cmd.field,
        label,
        sourceValue,
        ownerValue: value,
        correctedAt: at,
        actorLabel: actor.label,
        basis:
          "Owner correction: the owner says this is the correct " +
          label.toLowerCase() +
          ". The source record is unchanged.",
      };
      draft = {
        at,
        objectId,
        type: "owner.corrected-fact",
        actor,
        target: CONTACT_FIELD_TARGETS[cmd.field],
        previousBasis: { priorOwnerValue: prior, sourceValue },
        newValue: correction,
        evidence: sourceSnapshotEvidence(sourceValue),
        note:
          "Corrected " +
          label +
          ": the site lists " +
          (sourceValue ?? "no " + label.toLowerCase()) +
          "; the owner says " +
          value +
          ".",
        generator: "fyd-owner@1",
      };
      break;
    }
    case "confirm-contact-field": {
      // The owner asserts the current effective value is correct. Nothing
      // is changed: the assertion is recorded as an owner.confirmed-fact
      // event with the actor and timestamp, and the source's value at this
      // moment is preserved so later drift can be detected (sourceDrifted).
      // Fail closed when there is no recorded value to assert about.
      if (!isCorrectableField(cmd.field))
        throw new OwnerCommandError("Unknown contact field.");
      const label = FIELD_LABELS[cmd.field];
      const sourceValue = opts?.sourceValue ?? null;
      const confirmedValue =
        current.fieldCorrections[cmd.field]?.ownerValue ?? sourceValue;
      if (confirmedValue === null) {
        throw new OwnerCommandError(
          "There is no recorded " + label.toLowerCase() + " to confirm.",
        );
      }
      // The CONFIRM assertion, carrying the explicit owner-assertion
      // contract (see types.ts OwnerAssertion): actor, subject/object,
      // field/path, operation, value, visibility, timestamp, superseded
      // assertion, source/evidence relationship. `eventId` is assigned by
      // the log at append time, so the draft omits it; the reducer fills
      // it from the event envelope when projecting fieldConfirmations.
      const prior = current.fieldConfirmations[cmd.field] ?? null;
      const target = CONTACT_FIELD_TARGETS[cmd.field];
      const evidence = sourceSnapshotEvidence(sourceValue);
      const confirmation: Omit<FieldConfirmation, "eventId"> = {
        subject: objectId,
        path: target,
        operation: "confirm",
        value: confirmedValue,
        visibility: "unchanged",
        actor: { kind: actor.kind, label: actor.label },
        at,
        supersedes: prior?.eventId ?? null,
        evidence: {
          kind: evidence.kind,
          ref: evidence.ref,
          detail: evidence.detail,
        },
        field: cmd.field,
        confirmedValue,
        sourceValue,
        confirmedAt: at,
        actorLabel: actor.label,
      };
      draft = {
        at,
        objectId,
        type: "owner.confirmed-fact",
        actor,
        target,
        previousBasis: {
          priorConfirmation: prior,
          sourceValue,
          // Explicit supersede link to the superseded assertion event.
          supersedesEventId: prior?.eventId ?? null,
        },
        newValue: { confirmation: true, ...confirmation },
        evidence,
        note:
          "Confirmed " +
          label +
          ": the owner asserts '" +
          confirmedValue +
          "' is correct.",
        generator: "fyd-owner@1",
      };
      break;
    }
    case "revert-contact-field": {
      if (!isCorrectableField(cmd.field))
        throw new OwnerCommandError("Unknown contact field.");
      const label = FIELD_LABELS[cmd.field];
      const existing = current.fieldCorrections[cmd.field];
      if (!existing)
        throw new OwnerCommandError(
          "There is no " + label.toLowerCase() + " correction to revert.",
        );
      // Revert appends a restored event; the correction event stays in the
      // log. The projection stops composing the correction.
      draft = {
        at,
        objectId,
        type: "owner.restored-fact",
        actor,
        target: CONTACT_FIELD_TARGETS[cmd.field],
        previousBasis: { ...existing },
        newValue: null,
        evidence: {
          kind: "owner-attestation",
          ref: "command:revert-contact-field",
          detail:
            "owner reverted the " + label.toLowerCase() + " correction; " +
            "the correction event is preserved in the log",
        },
        note:
          "Reverted the " +
          label +
          " correction; the site's " +
          (existing.sourceValue ?? "record") +
          " is shown again.",
        generator: "fyd-owner@1",
      };
      break;
    }
    default:
      throw new OwnerCommandError("Unknown command.");
  }

  appendOwnerEvent(objectId, draft);
  return readOverrides(objectId);
}

/** Validate a raw JSON body into an OwnerCommand, or throw. */
export function parseOwnerCommand(body: unknown): OwnerCommand {
  if (typeof body !== "object" || body === null)
    throw new OwnerCommandError("Command must be an object.");
  const r = body as Record<string, unknown>;
  switch (r.type) {
    case "move-service":
      if (
        typeof r.id !== "string" ||
        !["up", "down", "first", "last"].includes(r.to as string)
      ) {
        throw new OwnerCommandError(
          "move-service needs { id, to: up|down|first|last }.",
        );
      }
      return {
        type: "move-service",
        id: r.id,
        to: r.to as "up" | "down" | "first" | "last",
      };
    case "set-service-visibility":
      if (typeof r.id !== "string" || typeof r.visible !== "boolean") {
        throw new OwnerCommandError(
          "set-service-visibility needs { id, visible }.",
        );
      }
      return { type: "set-service-visibility", id: r.id, visible: r.visible };
    case "add-service":
      if (typeof r.name !== "string")
        throw new OwnerCommandError("add-service needs { name }.");
      return { type: "add-service", name: r.name };
    case "set-address-visibility":
      if (r.visibility !== "public" && r.visibility !== "hidden") {
        throw new OwnerCommandError(
          "set-address-visibility needs { visibility: public|hidden }.",
        );
      }
      return { type: "set-address-visibility", visibility: r.visibility };
    case "set-contact-field":
      if (!isCorrectableField(r.field) || typeof r.value !== "string") {
        throw new OwnerCommandError(
          "set-contact-field needs { field: phone|email|website, value: string }.",
        );
      }
      return { type: "set-contact-field", field: r.field, value: r.value };
    case "revert-contact-field":
      if (!isCorrectableField(r.field)) {
        throw new OwnerCommandError(
          "revert-contact-field needs { field: phone|email|website }.",
        );
      }
      return { type: "revert-contact-field", field: r.field };
    case "confirm-contact-field":
      if (!isCorrectableField(r.field)) {
        throw new OwnerCommandError(
          "confirm-contact-field needs { field: phone|email|website }.",
        );
      }
      return { type: "confirm-contact-field", field: r.field };
    default:
      throw new OwnerCommandError("Unknown command type.");
  }
}
