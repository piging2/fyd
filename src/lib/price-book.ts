/**
 * The PingFyd price book: the one authoritative list of the seven
 * canonical offers. The /tiers price displays and the offers
 * structured data (buildPingFydOffersJsonLd) both read from here, so
 * a price change is one edit that propagates to the page and the
 * structured data together. The figures are the owner's locked price
 * book; they change only on the owner's word, and the standing gate
 * (price-book.test) pins this list to the locked figures.
 */
export interface PriceBookOffer {
  id: string;
  name: string;
  price: number;
  description: string;
  anchor: string;
}

export const PINGFYD_PRICE_BOOK: PriceBookOffer[] = [
  { id: "self-hosted", name: "Self-Hosted", price: 0, description: "Free forever.", anchor: "#self-hosted" },
  { id: "hosted-launch", name: "Hosted DIY Launch", price: 29, description: "Per month.", anchor: "#hosted" },
  { id: "hosted-growth", name: "Hosted DIY Growth", price: 59, description: "Per month.", anchor: "#hosted" },
  { id: "extra-site", name: "Extra site on Hosted DIY", price: 15, description: "Per site, per month.", anchor: "#hosted" },
  { id: "concierge-build", name: "Concierge Build", price: 2500, description: "Fixed price.", anchor: "#concierge" },
  { id: "concierge-retainer", name: "Concierge Retainer", price: 1250, description: "Per month.", anchor: "#concierge" },
  { id: "ai-workspace", name: "AI Workspace", price: 10000, description: "Setup, with a 9-hour labor cap.", anchor: "#ai-workspace" },
];

export function priceBookOffer(id: string): PriceBookOffer {
  const offer = PINGFYD_PRICE_BOOK.find((o) => o.id === id);
  if (!offer) throw new Error(`price book has no offer with id ${id}`);
  return offer;
}

/** "$0", "$29", "$2,500", "$10,000": manual grouping, locale-free. */
/**
 * The locked commercial terms that are not offers: annual prices,
 * the hourly floor and overage, the waitlist deposit, and the
 * Workspace setup floor. Same rule as the offers: they change only
 * on the owner's word, and the standing gate pins them here.
 */
export const PINGFYD_PRICE_TERMS = {
  hostedLaunchAnnual: 290,
  hostedGrowthAnnual: 590,
  hourlyFloor: 200,
  overageHourly: 250,
  overageBlock5h: 1250,
  waitlistDeposit: 500,
  workspaceSetupFrom: 7000,
} as const;

export type PriceBookTermId = keyof typeof PINGFYD_PRICE_TERMS;

export function priceBookTerm(id: PriceBookTermId): number {
  return PINGFYD_PRICE_TERMS[id];
}

export function formatPrice(price: number): string {
  return "$" + String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
