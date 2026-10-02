import type { Metadata } from "next";
import "./style.css";
import "./public-design.css";
import "./symbol-language.css";
export const metadata: Metadata = {
  title: "PING — Keep what your business learns.",
  description:
    "Continuity infrastructure for AI agents and the businesses they serve. Explore FYD, the PING model, and the build journal.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/dm-sans.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
