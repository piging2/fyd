/**
 * Lane 3 composer: verified-profile loading and binding discipline.
 *
 * The TenantOS profile (Lane 2 profile.json) is evidence-graded: every
 * field carries status VERIFIED | CONFLICTED | UNKNOWN, and some carry an
 * explicit DO_NOT_BIND binding flag. The composer may bind a field value
 * ONLY when the field is VERIFIED, carries no DO_NOT_BIND flag, and has a
 * non-null value. Everything else becomes an explicit omission record.
 * Variants of a CONFLICTED field are never read by any code path here:
 * the parsed field keeps only its status, so variants cannot leak.
 */

export type ProfileFieldStatus = "VERIFIED" | "CONFLICTED" | "UNKNOWN";

export interface ProfileField {
  status: ProfileFieldStatus;
  /** Present only when the field is bindable (VERIFIED, no DO_NOT_BIND, non-null). */
  value?: unknown;
  bindingFlag?: string;
}

export interface TenantProfile {
  tenant: string;
  fetchDate: string;
  fields: Record<string, ProfileField>;
}

export interface FieldOmission {
  field: string;
  status: string;
  reason: string;
}

export class ComposerProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposerProfileError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function hasDoNotBind(field: Record<string, unknown>): string | undefined {
  const b = field["binding"];
  if (typeof b === "string" && b.includes("DO_NOT_BIND")) return b;
  const w = field["binding_warning"];
  if (typeof w === "string" && w.includes("DO_NOT_BIND")) return w;
  return undefined;
}

/**
 * Parse raw Lane 2 profile JSON into a TenantProfile. Fail closed on any
 * shape violation. Deliberately drops `variants`, `sources`, and notes:
 * the composer keeps status and (when bindable) value only.
 */
export function parseProfile(raw: unknown): TenantProfile {
  if (!isRecord(raw)) throw new ComposerProfileError("profile: not an object");
  const tenant = raw["tenant"];
  if (typeof tenant !== "string" || tenant.length === 0) {
    throw new ComposerProfileError("profile: missing tenant id");
  }
  const fetchDate = raw["fetch_date"];
  if (typeof fetchDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fetchDate)) {
    throw new ComposerProfileError("profile: missing or malformed fetch_date");
  }
  const rawFields = raw["fields"];
  if (!isRecord(rawFields)) throw new ComposerProfileError("profile: missing fields");
  const fields: Record<string, ProfileField> = {};
  for (const name of Object.keys(rawFields).sort()) {
    const f = rawFields[name];
    if (!isRecord(f)) throw new ComposerProfileError("profile: field '" + name + "' is not an object");
    const status = f["status"];
    if (status !== "VERIFIED" && status !== "CONFLICTED" && status !== "UNKNOWN") {
      throw new ComposerProfileError("profile: field '" + name + "' has unrecognized status '" + String(status) + "'");
    }
    const flag = hasDoNotBind(f);
    const value = f["value"];
    const bindable = status === "VERIFIED" && flag === undefined && value !== null && value !== undefined;
    const parsed: ProfileField = { status };
    if (flag !== undefined) parsed.bindingFlag = flag;
    if (bindable) parsed.value = value;
    fields[name] = parsed;
  }
  return { tenant, fetchDate, fields };
}

/** Reason a field cannot bind, or undefined when it can. */
export function omissionFor(profile: TenantProfile, name: string): FieldOmission | undefined {
  const f = profile.fields[name];
  if (!f) return { field: name, status: "ABSENT", reason: "field is not present in the profile" };
  if (f.bindingFlag !== undefined) {
    return { field: name, status: f.status, reason: "DO_NOT_BIND: " + f.bindingFlag };
  }
  if (f.status !== "VERIFIED") {
    return { field: name, status: f.status, reason: "field status is " + f.status + "; only VERIFIED fields bind" };
  }
  if (f.value === undefined) {
    return { field: name, status: f.status, reason: "field value is null or absent" };
  }
  return undefined;
}

/**
 * The ONLY way composer code reads profile data. Returns the field value
 * when bindable; otherwise records an omission (once per field) and
 * returns undefined. Callers must handle undefined by omitting output.
 */
export class BindingView {
  private readonly omissions = new Map<string, FieldOmission>();
  private readonly bound = new Set<string>();

  constructor(private readonly profile: TenantProfile) {}

  bind<T = unknown>(name: string): T | undefined {
    const omission = omissionFor(this.profile, name);
    if (omission) {
      if (!this.omissions.has(name)) this.omissions.set(name, omission);
      return undefined;
    }
    this.bound.add(name);
    return this.profile.fields[name].value as T;
  }

  /** Peek at bindability without recording (for optional-section decisions). */
  canBind(name: string): boolean {
    return omissionFor(this.profile, name) === undefined;
  }

  /**
   * Record an omission for every profile field that cannot bind and has
   * not already been recorded, so the compile report is a complete audit
   * of the profile, not only of the fields some section happened to try.
   */
  recordAllOmissions(): void {
    for (const name of Object.keys(this.profile.fields)) {
      if (this.bound.has(name) || this.omissions.has(name)) continue;
      const omission = omissionFor(this.profile, name);
      if (omission) this.omissions.set(name, omission);
    }
  }

  boundFields(): string[] {
    return [...this.bound].sort();
  }

  omittedFields(): FieldOmission[] {
    return [...this.omissions.values()].sort((a, b) => (a.field < b.field ? -1 : 1));
  }
}
