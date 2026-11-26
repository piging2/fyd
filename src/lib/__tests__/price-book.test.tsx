import { renderToStaticMarkup } from "react-dom/server";
import TiersPage from "@/app/tiers/page";
import { PINGFYD_PRICE_BOOK, formatPrice, priceBookOffer } from "@/lib/price-book";
import { buildPingFydOffersJsonLd } from "@/lib/structured-data";

const LOCKED: Array<[string, string, number, string, string]> = [
  ["self-hosted", "Self-Hosted", 0, "Free forever.", "#self-hosted"],
  ["hosted-launch", "Hosted DIY Launch", 29, "Per month.", "#hosted"],
  ["hosted-growth", "Hosted DIY Growth", 59, "Per month.", "#hosted"],
  ["extra-site", "Extra site on Hosted DIY", 15, "Per site, per month.", "#hosted"],
  ["concierge-build", "Concierge Build", 2500, "Fixed price.", "#concierge"],
  ["concierge-retainer", "Concierge Retainer", 1250, "Per month.", "#concierge"],
  ["ai-workspace", "AI Workspace", 10000, "Setup, with a 9-hour labor cap.", "#ai-workspace"],
];

describe("price book single source", () => {
  it("the module is the locked price book, exactly", () => {
    expect(PINGFYD_PRICE_BOOK.map((o) => [o.id, o.name, o.price, o.description, o.anchor])).toEqual(LOCKED);
  });

  it("the offers structured data is built from the module", () => {
    const ld = buildPingFydOffersJsonLd("https://pingfyd.com") as unknown as {
      offers: Array<{ name: string; price: number; url: string }>;
    };
    expect(ld.offers.map((o) => [o.name, o.price, o.url])).toEqual(
      LOCKED.map(([, name, price, , anchor]) => [name, price, "https://pingfyd.com/tiers" + anchor]),
    );
  });

  it("the /tiers head figures render from the module", () => {
    const html = renderToStaticMarkup(<TiersPage />);
    for (const id of ["self-hosted", "hosted-launch", "concierge-build", "ai-workspace"]) {
      expect(html).toContain(formatPrice(priceBookOffer(id).price));
    }
    expect(formatPrice(2500)).toBe("$2,500");
    expect(formatPrice(10000)).toBe("$10,000");
  });
});
