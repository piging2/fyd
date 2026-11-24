import type { FaqItem } from "@/types/faq";

/**
 * Buying questions for the offer surfaces (/tiers and /faq), answered
 * only from facts published on /tiers and /products. One canonical
 * list for both surfaces; the FAQ section component emits the
 * FAQPage structured data from the same items.
 */
export const BUYING_FAQ_ITEMS: FaqItem[] = [
  {
    id: "b1",
    question: "What does each tier include?",
    answer:
      "Self-Hosted is the open core, the Build-in-Open Library, public documentation, and community support, free forever. Hosted DIY adds managed hosting, your site generated from your verified profile with an editing surface, a lead inbox with a custom domain, and async ticket support. Concierge is a fixed-price Build finished by hand where it matters, plus an optional Retainer that keeps it improving month to month.",
    category: "buying",
  },
  {
    id: "b2",
    question: "What happens when a Concierge Build reaches its 10-hour cap?",
    answer:
      "The hours are logged and visible to you. At the cap, work stops or converts; it never silently overflows. Overage is prepaid only: $250 per hour, or extra time in prepaid 5-hour blocks at $1,250.",
    category: "buying",
  },
  {
    id: "b3",
    question: "How does the Concierge waitlist work?",
    answer:
      "Concierge slots are limited and the work is delivered in evenings and weekends. When capacity is full, a waitlist holds your place with a $500 deposit, credited in full against your first package.",
    category: "buying",
  },
  {
    id: "b4",
    question: "Why are there no discounts?",
    answer:
      "The rate floor is $200 per owner hour, and packages are built so full use realizes $250. Concierge is never discounted. The one standing saving is annual billing on Hosted DIY: two months free, and never deeper. No coupon stacking, no lifetime deals.",
    category: "buying",
  },
  {
    id: "b5",
    question: "What does annual billing save on Hosted DIY?",
    answer:
      "Launch is $29 per month or $290 per year; Growth is $59 per month or $590 per year. Annual is two months free, about 17%, and never deeper.",
    category: "buying",
  },
  {
    id: "b6",
    question: "How much support comes with Hosted DIY?",
    answer:
      "Async ticket support on a next business day target: 3 tickets per month on Launch, 6 on Growth, with a priority queue on Growth. One boundary holds at both levels: zero 1:1 owner time, ever. No done-for-you work and no phone support.",
    category: "buying",
  },
  {
    id: "b7",
    question: "What does Self-Hosted cost?",
    answer:
      "$0, forever. No license fee and no per-seat fee. You run it and you host it. Hosting, backups, managed upgrades, and 1:1 help are not included; Tier 2 and Tier 3 are the hands for those.",
    category: "buying",
  },
  {
    id: "b8",
    question: "When is Concierge work delivered?",
    answer:
      "In evenings and weekends, because school hours are school hours. Capacity is stated rather than implied: slots are limited, hours are capped, and the waitlist absorbs demand rather than the calendar.",
    category: "buying",
  },
];
