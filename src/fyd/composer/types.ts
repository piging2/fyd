/**
 * Lane 3 composer: public types.
 *
 * The composer is a pre-composition stage: (template manifest + verified
 * tenant profile) -> complete base FYDSiteSpec + compile report. It reads
 * the TenantOS profile (an evidence-graded projection) and never writes
 * the object graph, never mints facts, and never touches kernel,
 * identity, or permission contracts.
 */

import type { FYDSiteSpec } from "@/fyd/sitespec/types";
import type { FieldOmission } from "./profile";

export interface ComposeOptions {
  /** Tenant the caller intends to compile. Must match the profile tenant. */
  tenant: string;
  /** Root business object id stamped onto the spec. */
  ownerObjectId: string;
  /** Template the caller asked for; mismatched or unknown refs fail closed. */
  templateRef?: string;
}

export interface PageOmission {
  id: string;
  reason: string;
}

export interface InexpressibleSection {
  page: string;
  section: string;
  needsComponent: string;
}

export interface SectionOmission {
  page: string;
  section: string;
  reason: string;
}

export interface FunctionalComponentRequirement {
  kind: string;
  /** Manifest-declared properties, carried verbatim (sorted keys). */
  properties: Record<string, unknown>;
  /** Destination is always a tenant binding, never a template default. */
  destinationBinding: string;
}

export interface CompileReport {
  tenant: string;
  templateId: string;
  templateVersion: string;
  archetype: string;
  pagesEmitted: string[];
  pagesOmitted: PageOmission[];
  sectionsEmitted: number;
  sectionsInexpressible: InexpressibleSection[];
  sectionsOmitted: SectionOmission[];
  fieldsBound: string[];
  fieldsOmitted: FieldOmission[];
  functionalComponents: FunctionalComponentRequirement[];
  /** Ratings/harvest inputs consumed by reference (desk addendum), never re-derived. */
  ratingsConsumed: Record<string, number>;
  ratingsRecord: string;
  determinismKey: string;
  notes: string[];
}

export interface ComposeResult {
  spec: FYDSiteSpec;
  report: CompileReport;
}

export type ComposerErrorCode =
  | "MANIFEST_INVALID"
  | "PROFILE_INVALID"
  | "TEMPLATE_UNKNOWN"
  | "TENANT_MISMATCH";

export class ComposerError extends Error {
  constructor(
    readonly code: ComposerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ComposerError";
  }
}
