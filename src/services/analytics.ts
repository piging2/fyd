/**
 * Analytics — TINY no-op interface (Directive 023).
 *
 * These are intentionally no-ops: no providers, no SDKs, no network. They exist
 * so components can call semantic events today; wiring a real provider later
 * means implementing this one interface, not editing components.
 */
export interface Analytics {
  trackEstimateStarted(service?: string): void;
  trackEstimateSubmitted(service?: string, transport?: string): void;
  trackPhoneClicked(): void;
  trackEmailClicked(): void;
}

const DEBUG = false; // flip to log events during development

function log(event: string, data?: unknown) {
  if (DEBUG && typeof console !== "undefined") {
    console.debug(`[analytics] ${event}`, data ?? "");
  }
}

export const noopAnalytics: Analytics = {
  trackEstimateStarted: (service) => log("estimate_started", { service }),
  trackEstimateSubmitted: (service, transport) => log("estimate_submitted", { service, transport }),
  trackPhoneClicked: () => log("phone_clicked"),
  trackEmailClicked: () => log("email_clicked"),
};

// The active analytics implementation. Swap to a real provider later.
export const analytics: Analytics = noopAnalytics;
