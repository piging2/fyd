import { renderToStaticMarkup } from "react-dom/server";
import { CrossSell } from "../cross-sell";
import { socialDestinations } from "@/lib/longping-media";

describe("CrossSell destinations sync", () => {
  it("renders the Substack and YouTube hrefs from the canonical list", () => {
    const html = renderToStaticMarkup(<CrossSell />);
    const substack = socialDestinations.find((d) => d.platform === "Substack");
    const youtube = socialDestinations.find((d) => d.platform === "YouTube");
    expect(substack).toBeDefined();
    expect(youtube).toBeDefined();
    expect(html).toContain(`href="${substack!.href}"`);
    expect(html).toContain(`href="${youtube!.href}"`);
  });

  it("renders no YouTube or Substack URL that is not in the canonical list", () => {
    const html = renderToStaticMarkup(<CrossSell />);
    const allowed = new Set(socialDestinations.map((d) => d.href));
    const urls = html.match(/href="https?:\/\/[^"]+"/g) ?? [];
    for (const u of urls) {
      const href = u.slice(6, -1);
      if (href.includes("youtube.com") || href.includes("substack.com")) {
        expect(allowed.has(href) || href.endsWith("/subscribe")).toBe(true);
      }
    }
  });
});
