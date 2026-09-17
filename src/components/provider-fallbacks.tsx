"use client";

import { ReactNode } from "react";

export function ThemeProviderFallback({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function MotionProviderFallback({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function LenisProviderFallback({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
