import type { Metadata } from "next";

/**
 * /practice containment (PING-WEBSITE-IMPROVE F3): the practice route is
 * an internal development and test surface. Give it honest metadata and
 * keep it out of search indexes until an owner decision publishes or
 * gates it. The page component and gateway code are untouched.
 */
export const metadata: Metadata = {
  title: "Practice",
  description:
    "PING Practice is a development and test surface for trying PING identities, circles, and social features. It is not a public product page.",
  robots: { index: false, follow: false },
};

export default function PracticeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
