/**
 * Owner state store (server-only).
 *
 * Owner decisions are DURABLE state, not generated cache. They live in
 * data/fyd-owner/<objectId>.json, one file per object, completely separate
 * from source state (fixtures, manifests). Source re-ingestion reads and
 * writes only source state; it can never erase owner intent.
 *
 * All commands fail closed: unknown ids, bad shapes, and empty names are
 * rejected with a typed error and nothing is written.
 *
 * FYD_OWNER_DIR env override exists so tests can use a temp directory.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OwnerCommand, OwnerOverrides } from "./types";
import type { OwnerFieldCorrection } from "../../lib/ping/types";
import { EMPTY_OVERRIDES } from "./types";
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

function ownerDir(): string {
  const override = process.env.FYD_OWNER_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-owner");
}

function ownerPath(objectId: string): string {
  if (!/^[a-z0-9-]+$/.test(objectId)) {
    throw new OwnerCommandError("Invalid object id.");
  }
  return join(ownerDir(), objectId + ".json");
}

function isValidOverrides(v: unknown): v is OwnerOverrides {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  // fieldCorrections is optional on read: store files written before the
  // correction lane exist without it and are migrated to {} in
  // readOverrides rather than rejected.
  const fc = r.fieldCorrections;
  const fcOk =
    fc === undefined ||
    (typeof fc === "object" && fc !== null && !Array.isArray(fc));
  return (
    r.version === 1 &&
    typeof r.objectId === "string" &&
    Array.isArray(r.serviceOrder) &&
    Array.isArray(r.hiddenServices) &&
    Array.isArray(r.addedServices) &&
    fcOk &&
    Array.isArray(r.history)
  );
}

export function readOverrides(objectId: string): OwnerOverrides {
  const base = EMPTY_OVERRIDES(objectId);
  try {
    const raw = readFileSync(ownerPath(objectId), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isValidOverrides(parsed) || parsed.objectId !== objectId) return base;
    if (!parsed.fieldCorrections) parsed.fieldCorrections = {};
    return parsed;
  } catch {
    return base;
  }
}

function writeOverrides(o: OwnerOverrides): void {
  const path = ownerPath(o.objectId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n", "utf8");
  // Atomic replace so a crash can never leave a half-written file.
  const { renameSync } = require("node:fs") as typeof import("node:fs");
  renameSync(tmp, path);
}

function stamp(o: OwnerOverrides): void {
  o.updatedAt = new Date().toISOString();
}

function log(o: OwnerOverrides, text: string): void {
  o.history.push({ at: new Date().toISOString(), text });
  if (o.history.length > 200) o.history = o.history.slice(-200);
}

/**
 * Apply one owner command. `knownServiceIds` is the current full derived +
 * added id set; commands referencing unknown ids are rejected.
 * `opts.sourceValue` / `opts.actorLabel` are used by contact-field
 * corrections: the source's value at correction time (so the SOURCE SAYS
 * X half of the record is never lost) and the authority label the
 * correction is recorded under (demo: the seeded demo actor label).
 * Returns the updated overrides (also persisted).
 */
export interface ApplyCommandOpts {
  sourceValue?: string | null;
  actorLabel?: string;
}

export function applyOwnerCommand(
  objectId: string,
  cmd: OwnerCommand,
  knownServiceIds: string[],
  knownServiceNames: Map<string, string>,
  opts?: ApplyCommandOpts,
): OwnerOverrides {
  const o = readOverrides(objectId);
  const known = new Set(knownServiceIds);

  switch (cmd.type) {
    case "move-service": {
      if (!known.has(cmd.id)) throw new OwnerCommandError("Unknown service.");
      // Materialize the current order: owner order first, then any new ids.
      const order = [...o.serviceOrder.filter((id) => known.has(id))];
      for (const id of knownServiceIds) if (!order.includes(id)) order.push(id);
      const idx = order.indexOf(cmd.id);
      order.splice(idx, 1);
      if (cmd.to === "first") order.unshift(cmd.id);
      else if (cmd.to === "last") order.push(cmd.id);
      else if (cmd.to === "up") order.splice(Math.max(0, idx - 1), 0, cmd.id);
      else order.splice(Math.min(order.length, idx + 1), 0, cmd.id);
      o.serviceOrder = order;
      const name = knownServiceNames.get(cmd.id) ?? cmd.id;
      log(o, `Moved ${name} ${cmd.to === "first" ? "to the top" : cmd.to === "last" ? "to the bottom" : cmd.to}.`);
      break;
    }
    case "set-service-visibility": {
      if (!known.has(cmd.id)) throw new OwnerCommandError("Unknown service.");
      const name = knownServiceNames.get(cmd.id) ?? cmd.id;
      if (cmd.visible) {
        o.hiddenServices = o.hiddenServices.filter((id) => id !== cmd.id);
        log(o, `Showed ${name}.`);
      } else {
        if (!o.hiddenServices.includes(cmd.id)) o.hiddenServices.push(cmd.id);
        log(o, `Hid ${name}.`);
      }
      break;
    }
    case "add-service": {
      const name = cmd.name.trim().replace(/\s+/g, " ");
      if (!name || name.length > 60) throw new OwnerCommandError("Service name must be 1-60 characters.");
      const id = slugifyService(name);
      if (known.has(id) || o.addedServices.some((s) => s.id === id)) {
        throw new OwnerCommandError("That service already exists.");
      }
      o.addedServices.push({ id, name });
      log(o, `Added ${name}.`);
      break;
    }
    case "set-address-visibility": {
      if (cmd.visibility !== "public" && cmd.visibility !== "hidden") {
        throw new OwnerCommandError("Visibility must be public or hidden.");
      }
      o.addressVisibility = cmd.visibility;
      log(o, cmd.visibility === "hidden" ? "Hid the street address." : "Made the address public.");
      break;
    }
    case "set-contact-field": {
      // The owner attests a corrected contact value. The source record is
      // NOT rewritten: the correction is stored as its own event with the
      // source's value at this moment preserved as sourceValue. The read
      // model composes ownerValue over the source at serve time.
      if (!isCorrectableField(cmd.field)) throw new OwnerCommandError("Unknown contact field.");
      const value = normalizeFieldValue(cmd.field, cmd.value);
      if (!value) throw new OwnerCommandError("A value is required.");
      validateFieldValue(cmd.field, value);
      const label = FIELD_LABELS[cmd.field];
      const sourceValue = opts?.sourceValue ?? null;
      const actorLabel = opts?.actorLabel ?? "Demo Owner (seeded, unverified)";
      const correction: OwnerFieldCorrection = {
        field: cmd.field,
        label,
        sourceValue,
        ownerValue: value,
        correctedAt: new Date().toISOString(),
        actorLabel,
        basis:
          "Owner correction: the owner says this is the correct " +
          label.toLowerCase() +
          ". The source record is unchanged.",
      };
      o.fieldCorrections[cmd.field] = correction;
      log(
        o,
        "Corrected " +
          label +
          ": the site lists " +
          (sourceValue ?? "no " + label.toLowerCase()) +
          "; the owner says " +
          value +
          ".",
      );
      break;
    }
    case "revert-contact-field": {
      if (!isCorrectableField(cmd.field)) throw new OwnerCommandError("Unknown contact field.");
      const label = FIELD_LABELS[cmd.field];
      const existing = o.fieldCorrections[cmd.field];
      if (!existing) throw new OwnerCommandError("There is no " + label.toLowerCase() + " correction to revert.");
      delete o.fieldCorrections[cmd.field];
      log(
        o,
        "Reverted the " +
          label +
          " correction; the site's " +
          (existing.sourceValue ?? "record") +
          " is shown again.",
      );
      break;
    }
    default:
      throw new OwnerCommandError("Unknown command.");
  }

  stamp(o);
  writeOverrides(o);
  return o;
}

/** Validate a raw JSON body into an OwnerCommand, or throw. */
export function parseOwnerCommand(body: unknown): OwnerCommand {
  if (typeof body !== "object" || body === null) throw new OwnerCommandError("Command must be an object.");
  const r = body as Record<string, unknown>;
  switch (r.type) {
    case "move-service":
      if (typeof r.id !== "string" || !["up", "down", "first", "last"].includes(r.to as string)) {
        throw new OwnerCommandError("move-service needs { id, to: up|down|first|last }.");
      }
      return { type: "move-service", id: r.id, to: r.to as "up" | "down" | "first" | "last" };
    case "set-service-visibility":
      if (typeof r.id !== "string" || typeof r.visible !== "boolean") {
        throw new OwnerCommandError("set-service-visibility needs { id, visible }.");
      }
      return { type: "set-service-visibility", id: r.id, visible: r.visible };
    case "add-service":
      if (typeof r.name !== "string") throw new OwnerCommandError("add-service needs { name }.");
      return { type: "add-service", name: r.name };
    case "set-address-visibility":
      if (r.visibility !== "public" && r.visibility !== "hidden") {
        throw new OwnerCommandError("set-address-visibility needs { visibility: public|hidden }.");
      }
      return { type: "set-address-visibility", visibility: r.visibility };
    case "set-contact-field":
      if (!isCorrectableField(r.field) || typeof r.value !== "string") {
        throw new OwnerCommandError("set-contact-field needs { field: phone|email|website, value: string }.");
      }
      return { type: "set-contact-field", field: r.field, value: r.value };
    case "revert-contact-field":
      if (!isCorrectableField(r.field)) {
        throw new OwnerCommandError("revert-contact-field needs { field: phone|email|website }.");
      }
      return { type: "revert-contact-field", field: r.field };
    default:
      throw new OwnerCommandError("Unknown command type.");
  }
}
