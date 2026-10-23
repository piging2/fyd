"use client";
export default function SiteReadError({reset}:{reset:()=>void}) {
  return <main className="mx-auto max-w-3xl px-6 py-16"><h1>Business information unavailable</h1><p>We could not establish the current business information. Please try again.</p><button type="button" onClick={reset} className="mt-4 min-h-[44px] underline">Try again</button></main>;
}
