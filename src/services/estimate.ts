import type { EstimateRequest } from "@/types";
import { getCompany } from "@/lib/company";
import { getServiceBySlug } from "@/lib/registries";
import { features } from "@/config/infrastructure-flags";

/**
 * Estimate submission service — INTERFACE.
 *
 * The MVP submits via email (mailto). Later, swap the implementation (e.g.
 * `submitEstimateApi`) WITHOUT touching any component — components depend on
 * this interface only. This is the single swap point mandated by Directive 021.
 */
export interface EstimateService {
  /** Build a shareable submission (mailto link today; API payload later). */
  prepare(request: EstimateRequest, forceMailto?: boolean): { kind: "mailto"; href: string } | { kind: "api"; body: unknown };
  /**
   * Submit the request. UI calls this and awaits a uniform result — identical
   * to the future API workflow. Today it opens the user's mail client. When a
   * backend exists, swap this implementation to POST; the wizard does not change.
   */
  submit(request: EstimateRequest): Promise<EstimateSubmitResult>;
}

export interface EstimateSubmitResult {
  ok: boolean;
  /** transport actually used, for analytics/telemetry */
  transport: "mailto" | "api";
  message?: string;
}

function answersToText(req: EstimateRequest): string {
  const svc = getServiceBySlug(req.services[0] ?? "");
  const lines: string[] = [];
  for (const [key, val] of Object.entries(req.answers)) {
    const q = svc?.estimateQuestions?.find((q) => q.id === key);
    lines.push(`- ${q?.label ?? key}: ${val}`);
  }
  return lines.join("\n");
}

function photoText(req: EstimateRequest): string {
  if (!req.photos.length) return "(no photos attached)";
  return req.photos.map((p) => `  • ${p.name} (${p.size} bytes)`).join("\n");
}

/** Default mock implementation: composes a mailto: link to the business inbox. */
export const mockEstimateService: EstimateService = {
  prepare(req, forceMailto = false): { kind: "mailto"; href: string } | { kind: "api"; body: unknown } {
    if (features.estimateApi && !forceMailto) {
      return { kind: "api", body: req };
    }
    const company = getCompany();
    const svcTitles = req.services.map((sl) => getServiceBySlug(sl)?.name ?? sl);
    const subject = `Estimate request: ${svcTitles.join(", ") || "General inquiry"}`;
    const body = [
      `New estimate request from ${req.customer.name}`,
      ``,
      `CONTACT`,
      `  Name:    ${req.customer.name}`,
      `  Email:   ${req.customer.email}`,
      `  Phone:   ${req.customer.phone}`,
      ``,
      `PROPERTY`,
      `  Address: ${req.property.address || "(not provided)"}`,
      `  City:    ${req.property.city}`,
      `  County:  ${req.property.county}`,
      `  Details: ${req.property.details || "-"}`,
      ``,
      `SERVICE: ${svcTitles.join(", ") || "(none selected)"}`,
      ``,
      `PROJECT INTENT: ${req.projectIntent || "-"}`,
      ``,
      `ANSWERS`,
      answersToText(req),
      ``,
      `PHOTOS (${req.photos.length})`,
      photoText(req),
      ``,
      `SERVICES SELECTED: ${req.services.length} (max 3)`,
      `DIDN'T SEE WHAT YOU NEED: ${req.otherNeed || "-"}`,
      ``,
      `NOTES: ${req.notes || "-"}`,
    ].join("\n");

    const href = `mailto:${company.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return { kind: "mailto", href };
  },

  async submit(req) {
    const prepared = this.prepare(req);
    if (prepared.kind === "api") {
      // Server-side Google Workspace flow (Horizon 2, gated by featureFlags).
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(`api ${res.status}`);
        return { ok: true, transport: "api", message: "Request sent. We'll be in touch soon." };
      } catch (error) {
        // Fallback to mailto so the customer is never blocked.
        const mailto = this.prepare(req, true);
        if (mailto.kind === "mailto" && typeof window !== "undefined") {
          window.location.href = mailto.href;
        }
        return { ok: true, transport: "mailto", message: "Request sent via email." };
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = prepared.href;
    }
    return { ok: true, transport: "mailto", message: "Opened email client with your request." };
  },
};

// The active service. Swap this single line to change transport.
export const estimateService: EstimateService = mockEstimateService;
