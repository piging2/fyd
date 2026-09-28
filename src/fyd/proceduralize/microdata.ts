/**
 * Microdata (itemscope/itemprop) extraction for the structured-data stage.
 *
 * Harvest 2026-09-28, writer gate binding 12-gate, from HEAD 4a8c5f2e.
 *
 * Attribution (BSD-3-Clause, algorithm reference only):
 *   extruct - metadata extraction library - https://github.com/scrapinghub/extruct
 *   Pinned reference commit: a31daaadb82ec684b7d468d3b15734b8ae3b7265
 * The itemscope walk, itemprop collection, attribute precedence
 * (content, href, src, then text), and nested-itemscope recursion follow
 * extruct's microdata extractor as the reference algorithm. This file is an
 * original TypeScript implementation written against node-html-parser.
 * extruct is never imported, vendored, or depended on (new deps: 0).
 *
 * What this module does: find schema.org itemscope records in raw HTML and
 * emit them as JSON-LD-shaped records, the same record shape
 * discoverStructuredData already produces for <script
 * type="application/ld+json"> blocks. The downstream evidence pipeline
 * (expandJsonLdBlocks -> entityCandidates -> extractStructuredData) does
 * not change.
 *
 * SCHEMA.ORG TYPE FILTERING: only the types the OBJECT stage consumes are
 * emitted (LocalBusiness and its subtypes, PostalAddress,
 * OpeningHoursSpecification, Organization, Person). This is deliberate, not
 * a blind multi-syntax dump: corpus pages carry hundreds of RDFa/menu-role
 * vocabulary statements that are noise to the OBJECT stage.
 *
 * Determinism: no module state. Property keys are sorted, record @ids are
 * derived from a content hash. Same HTML yields the same records on every
 * run, regardless of process or prior ingestions.
 */

import { parse, HTMLElement } from "node-html-parser";
import { sha256Hex } from "./sha256";

/** A microdata itemscope record in JSON-LD record shape. */
export interface MicrodataNode {
  "@type": string;
  "@id": string;
  [property: string]: unknown;
}

export interface MicrodataItem {
  /** The itemscope element's outer HTML, for the block's raw field. */
  raw: string;
  /** The typed record: JSON-LD shaped, nested records attached by property. */
  parsed: MicrodataNode;
}

/**
 * schema.org types the OBJECT stage consumes. LocalBusiness and its
 * subtypes, plus the structural types nested inside business records
 * (PostalAddress, OpeningHoursSpecification) and the entity types used
 * for authorship/ownership (Organization, Person). Anything else on the
 * page is site noise and is never emitted.
 */
const EMIT_TYPES: ReadonlySet<string> = new Set([
  "LocalBusiness",
  "AnimalShelter",
  "AutomotiveBusiness",
  "AutoBodyShop",
  "AutoDealer",
  "AutoPartsStore",
  "AutoRental",
  "AutoRepair",
  "AutoWash",
  "GasStation",
  "MotorcycleDealer",
  "MotorcycleRepair",
  "ChildCare",
  "Dentist",
  "DryCleaningOrLaundry",
  "EmergencyService",
  "FireStation",
  "Hospital",
  "PoliceStation",
  "EmploymentAgency",
  "EntertainmentBusiness",
  "AdultEntertainment",
  "AmusementPark",
  "ArtGallery",
  "Casino",
  "ComedyClub",
  "MovieTheater",
  "NightClub",
  "FinancialService",
  "AccountingService",
  "AutomatedTeller",
  "BankOrCreditUnion",
  "InsuranceAgency",
  "FoodEstablishment",
  "Bakery",
  "BarOrPub",
  "Brewery",
  "CafeOrCoffeeShop",
  "FastFoodRestaurant",
  "IceCreamShop",
  "Restaurant",
  "Winery",
  "GovernmentOffice",
  "PostOffice",
  "HealthAndBeautyBusiness",
  "BeautySalon",
  "DaySpa",
  "HairSalon",
  "HealthClub",
  "NailSalon",
  "TattooParlor",
  "HomeAndConstructionBusiness",
  "Electrician",
  "GeneralContractor",
  "HVACBusiness",
  "HousePainter",
  "Locksmith",
  "MovingCompany",
  "Plumber",
  "RoofingContractor",
  "InternetCafe",
  "LegalService",
  "Attorney",
  "Notary",
  "Library",
  "LodgingBusiness",
  "BedAndBreakfast",
  "Campground",
  "Hostel",
  "Hotel",
  "Motel",
  "Resort",
  "SkiResort",
  "MedicalBusiness",
  "CommunityHealth",
  "Dermatology",
  "DietNutrition",
  "Geriatric",
  "Gynecologic",
  "MedicalClinic",
  "Midwifery",
  "Nursing",
  "Obstetric",
  "Oncologic",
  "Optician",
  "Optometric",
  "Otolaryngologic",
  "Pediatric",
  "Pharmacy",
  "Physician",
  "Physiotherapy",
  "PlasticSurgery",
  "Podiatric",
  "PrimaryCare",
  "Psychiatric",
  "PublicHealth",
  "ProfessionalService",
  "RadioStation",
  "RealEstateAgent",
  "RecyclingCenter",
  "SelfStorage",
  "ShoppingCenter",
  "SportsActivityLocation",
  "BowlingAlley",
  "ExerciseGym",
  "GolfCourse",
  "PublicSwimmingPool",
  "SportsClub",
  "StadiumOrArena",
  "TennisComplex",
  "Store",
  "BikeStore",
  "BookStore",
  "ClothingStore",
  "ComputerStore",
  "ConvenienceStore",
  "DepartmentStore",
  "ElectronicsStore",
  "Florist",
  "FurnitureStore",
  "GardenStore",
  "GroceryStore",
  "HardwareStore",
  "HobbyShop",
  "HomeGoodsStore",
  "JewelryStore",
  "LiquorStore",
  "MensClothingStore",
  "MobilePhoneStore",
  "MovieRentalStore",
  "MusicStore",
  "OfficeEquipmentStore",
  "OutletStore",
  "PetStore",
  "ShoeStore",
  "SportingGoodsStore",
  "TireShop",
  "ToyStore",
  "WholesaleStore",
  "TelevisionStation",
  "TouristInformationCenter",
  "TravelAgency",
  "PostalAddress",
  "OpeningHoursSpecification",
  "Organization",
  "Person",
]);

/** Schema.org type name: first itemtype token, fragment after the last "/". */
function typeNameFromItemtype(itemtype: string | undefined): string {
  if (!itemtype) return "";
  const first = itemtype.trim().split(/\s+/)[0] ?? "";
  if (first === "") return "";
  const slash = first.lastIndexOf("/");
  return slash >= 0 ? first.slice(slash + 1) : first;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * extruct's literal precedence: content, then href, then src, then the
 * element's text content (whitespace-collapsed).
 */
function literalValue(el: HTMLElement): string {
  const attr =
    el.getAttribute("content") ??
    el.getAttribute("href") ??
    el.getAttribute("src");
  if (attr !== undefined) return collapseWhitespace(attr);
  return collapseWhitespace(el.text);
}

/** True when the nearest ancestor itemscope of el is scope itself. */
function ownedByScope(el: HTMLElement, scope: HTMLElement): boolean {
  let node: unknown = el.parentNode;
  while (node) {
    if (node === scope) return true;
    if (node instanceof HTMLElement && node.hasAttribute("itemscope")) {
      return false;
    }
    node = (node as HTMLElement).parentNode;
  }
  return false;
}

function isNestedScope(scope: HTMLElement): boolean {
  let node: unknown = scope.parentNode;
  while (node) {
    if (node instanceof HTMLElement && node.hasAttribute("itemscope")) {
      return true;
    }
    node = (node as HTMLElement).parentNode;
  }
  return false;
}

/**
 * Build the typed record for one itemscope element. Returns null when the
 * scope's type is not in the emit set (filtered noise, never emitted).
 * Nested itemscopes recurse and attach under the property name.
 */
function buildNode(scope: HTMLElement): MicrodataNode | null {
  const typeName = typeNameFromItemtype(scope.getAttribute("itemtype"));
  if (!EMIT_TYPES.has(typeName)) return null;

  const props = new Map<string, unknown[]>();
  for (const el of scope.querySelectorAll("[itemprop]")) {
    if (!ownedByScope(el, scope)) continue;
    const tokens = (el.getAttribute("itemprop") ?? "")
      .trim()
      .split(/\s+/)
      .filter((t) => t !== "");
    if (tokens.length === 0) continue;
    let value: unknown;
    if (el.hasAttribute("itemscope")) {
      const nested = buildNode(el);
      if (!nested) continue;
      value = nested;
    } else {
      const text = literalValue(el);
      if (text === "") continue;
      value = text;
    }
    for (const token of tokens) {
      const arr = props.get(token);
      if (arr) arr.push(value);
      else props.set(token, [value]);
    }
  }

  const body: Record<string, unknown> = {};
  for (const key of [...props.keys()].sort()) {
    const vals = props.get(key) as unknown[];
    body[key] = vals.length === 1 ? vals[0] : vals;
  }
  const withoutId: Record<string, unknown> = { "@type": typeName, ...body };
  const id =
    "urn:microdata:" + sha256Hex(JSON.stringify(withoutId)).slice(0, 24);
  return { "@type": typeName, "@id": id, ...body };
}

/**
 * Extract top-level typed microdata records from raw HTML, in document
 * order. Nested itemscopes attach inside their parent record and are not
 * emitted separately. Never throws: unparseable HTML yields no records.
 */
export function extractMicrodata(html: string): MicrodataItem[] {
  let root: HTMLElement;
  try {
    root = parse(html);
  } catch {
    return [];
  }
  const items: MicrodataItem[] = [];
  for (const scope of root.querySelectorAll("[itemscope]")) {
    if (isNestedScope(scope)) continue;
    const parsed = buildNode(scope);
    if (!parsed) continue;
    items.push({ raw: scope.toString(), parsed });
  }
  return items;
}
