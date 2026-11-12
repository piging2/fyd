export const FYD_CHAPTERS = [
  { href: "#understand", label: "Understand" },
  { href: "#explore", label: "Explore" },
  { href: "#see", label: "See live demos", mobile: true },
  { href: "#how", label: "How FYD works", mobile: true },
  { href: "#fyd-ask", label: "Ask about Coppersmith", mobile: true },
  { href: "#network", label: "Network" },
  { href: "#install", label: "Install" },
  { href: "#inside", label: "PING inside" },
  { href: "#privacy", label: "Your data" },
  { href: "#try", label: "Try your website", mobile: true },
];

export function focusFydChapter(href: string) {
  const heading = document.getElementById(href.slice(1))?.querySelector<HTMLElement>("h1, h2");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}
