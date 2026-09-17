"use client";

import * as React from "react";
import { analytics } from "@/services/analytics";

/** Phone link that fires a no-op analytics event on click. */
export function PhoneLink({ phone, className, children }: { phone: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={`tel:${phone}`} className={className} onClick={() => analytics.trackPhoneClicked()}>
      {children}
    </a>
  );
}

/** Email link that fires a no-op analytics event on click. */
export function EmailLink({ email, className, children }: { email: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={`mailto:${email}`} className={className} onClick={() => analytics.trackEmailClicked()}>
      {children}
    </a>
  );
}
