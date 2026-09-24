/**
 * /sites layout: imports the edge-object sheet stylesheet so the
 * tap-to-expand edge experience is styled on every FYD demo site.
 * No visual or structural change beyond the stylesheet import.
 */

import "@/fyd/edge/edge-sheet.css";

export default function SitesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
