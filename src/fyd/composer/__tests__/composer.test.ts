/**
 * Lane 3 composer battery. Fixtures are byte-identical copies of the real
 * Lane 1 template manifest and Lane 2 Coppersmith profile (see fixtures/
 * README). Every test maps to a DESIGN.md success condition.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { applyArchetype } from "@/fyd/archetypes/apply";
import { TRADES_PROFILE } from "@/fyd/archetypes/profiles";
import { FYD_SCHEMAS } from "@/fyd/sitespec/schemas";
import { isRenderable, validateSiteSpec } from "@/fyd/sitespec/validator";
import { canonicalStringify, compileTemplate, slugify } from "../compile";
import { BindingView, parseProfile } from "../profile";
import { ComposerError } from "../types";

const FIX = join(__dirname, "fixtures");
const manifestRaw = JSON.parse(readFileSync(join(FIX, "template-manifest.json"), "utf8"));
const profileRaw = JSON.parse(readFileSync(join(FIX, "profile.json"), "utf8"));

const OPTS = { tenant: "coppersmith-plumbing", ownerObjectId: "website-business-coppersmith-test" };
const KNOWN_SCHEMAS = new Set(FYD_SCHEMAS.map((s) => s.id));

function compile() {
  return compileTemplate(manifestRaw, profileRaw, OPTS);
}

/** Deep key-shuffle: rebuild an object with reversed key order everywhere. */
function shuffleKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(shuffleKeys);
  const rec = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort().reverse()) out[k] = shuffleKeys(rec[k]);
  return out;
}

describe("1. determinism", () => {
  it("two compiles are byte-identical with equal determinismKey", () => {
    const a = compile();
    const b = compile();
    expect(canonicalStringify(a.spec)).toBe(canonicalStringify(b.spec));
    expect(a.report.determinismKey).toBe(b.report.determinismKey);
    expect(a.report.determinismKey).toMatch(/^[0-9a-f]{64}$/);
  });
  it("shuffled profile and manifest key order compiles identically", () => {
    const a = compile();
    const b = compileTemplate(shuffleKeys(manifestRaw), shuffleKeys(profileRaw), OPTS);
    expect(canonicalStringify(a.spec)).toBe(canonicalStringify(b.spec));
    expect(a.report.determinismKey).toBe(b.report.determinismKey);
  });
  it("generatedAt derives from the profile fetch_date, never the wall clock", () => {
    const a = compile();
    expect(a.spec.generator.generatedAt).toBe("2026-11-04T00:00:00.000Z");
  });
});

describe("2. completeness + existing validator", () => {
  it("compiled spec passes validateSiteSpec with zero errors", () => {
    const { spec } = compile();
    const findings = validateSiteSpec(spec, KNOWN_SCHEMAS);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(isRenderable(findings)).toBe(true);
  });
  it("every manifest-required non-record page is present", () => {
    const { spec } = compile();
    const slugs = new Set(spec.pages.map((p) => p.slug));
    for (const slug of ["home", "services", "work", "about", "reviews", "faq", "contact", "estimate", "privacy", "404", "error"]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });
  it("exactly 6 serviceDetail pages exist, one per VERIFIED service, in profile order", () => {
    const { spec, report } = compile();
    const detail = spec.pages.filter((p) => p.slug.startsWith("services/"));
    expect(detail.length).toBe(6);
    expect(detail.map((p) => p.title)).toEqual([
      "Plumbing",
      "Heating",
      "Cooling",
      "Ventilation",
      "HVAC Systems (Residential and Commercial)",
      "Installation Services",
    ]);
    expect(detail[0].slug).toBe("services/" + slugify("Plumbing"));
    expect(report.pagesOmitted.some((o) => o.id === "projectDetail" && o.reason.startsWith("REQUIRED_PAGE_NO_RECORDS"))).toBe(true);
  });
  it("navigation points only at emitted pages", () => {
    const { spec } = compile();
    const slugs = new Set(spec.pages.map((p) => p.slug));
    for (const nav of spec.navigation) expect(slugs.has(nav.pageSlug)).toBe(true);
    expect(spec.navigation.map((n) => n.pageSlug)).toEqual(["home", "services", "work", "about", "reviews", "contact"]);
  });
});

describe("3. manifest validation fails closed", () => {
  it("unknown template reference throws", () => {
    expect(() => compileTemplate(manifestRaw, profileRaw, { ...OPTS, templateRef: "nonexistent-template" })).toThrow(ComposerError);
    const bad = { ...manifestRaw, templateId: "nonexistent-template" };
    expect(() => compileTemplate(bad, profileRaw, OPTS)).toThrow(/unknown template/);
  });
  it("a required page with no sections (not a shell) is MANIFEST_INVALID", () => {
    const bad = JSON.parse(JSON.stringify(manifestRaw));
    bad.pages = bad.pages.map((p: { id: string }) => (p.id === "faq" ? { id: "faq", required: true, sections: [] } : p));
    expect(() => compileTemplate(bad, profileRaw, OPTS)).toThrow(/declares no sections/);
  });
  it("an unknown required page id is MANIFEST_INVALID", () => {
    const bad = JSON.parse(JSON.stringify(manifestRaw));
    bad.pages.push({ id: "mysteryPage", required: true, sections: ["Hero"] });
    expect(() => compileTemplate(bad, profileRaw, OPTS)).toThrow(/not a page the composer can synthesize/);
  });
  it("duplicate page ids are MANIFEST_INVALID", () => {
    const bad = JSON.parse(JSON.stringify(manifestRaw));
    bad.pages.push(bad.pages[0]);
    expect(() => compileTemplate(bad, profileRaw, OPTS)).toThrow(/duplicate page id/);
  });
});

describe("4. negative binding: conflicts, unknowns, and DO_NOT_BIND never render", () => {
  const FORBIDDEN = [
    "John Smith",
    "over 25 years",
    "29 years",
    "since 1995",
    "Maldonado",
    "Industrial",
    "81501",
    "81505",
    "Bob Kleeman",
    "Joey Turner",
    "4.4",
    "4.3",
    "3.5",
    "3.3",
    "Monday-Friday",
  ];
  it("serialized spec contains no conflicted variant, placeholder, address, or rating", () => {
    const { spec } = compile();
    const json = JSON.stringify(spec);
    for (const s of FORBIDDEN) {
      expect(json.includes(s)).toBe(false);
    }
    // No email was published anywhere in the profile, so none may appear.
    // (Alphabetic TLD required: the generator version string legitimately
    // contains a template@version pin, which is not an email address.)
    expect(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(json)).toBe(false);
  });
  it("binding view exposes VERIFIED fields and hides the rest", () => {
    const view = new BindingView(parseProfile(profileRaw));
    expect(view.bind("services")).toBeDefined();
    expect(view.bind("tagline")).toBe("You don't need a plumber, you need a Coppersmith!");
    expect(view.bind("phone")).toBe("970-245-3869");
    for (const f of ["display_name", "locations", "years_in_business", "hours", "email", "team", "reviews_summary", "prices", "founded_year"]) {
      expect(view.bind(f)).toBeUndefined();
    }
    const omitted = view.omittedFields().map((o) => o.field);
    for (const f of ["display_name", "locations", "years_in_business", "hours", "email"]) {
      expect(omitted).toContain(f);
    }
  });
  it("compile report names the omitted fields with their statuses", () => {
    const { report } = compile();
    const byField = new Map(report.fieldsOmitted.map((o) => [o.field, o.status]));
    expect(byField.get("display_name")).toBe("CONFLICTED");
    expect(byField.get("years_in_business")).toBe("CONFLICTED");
    expect(byField.get("locations")).toBe("CONFLICTED");
    expect(byField.get("hours")).toBe("CONFLICTED");
    expect(byField.get("email")).toBe("UNKNOWN");
    expect(report.fieldsBound).toContain("services");
    expect(report.fieldsBound).not.toContain("team");
  });
  it("the VERIFIED phone and tagline do bind (positive control)", () => {
    const { spec } = compile();
    const json = JSON.stringify(spec);
    expect(json.includes("970-245-3869")).toBe(true);
    expect(json.includes("need a Coppersmith")).toBe(true);
  });
});

describe("5. tenant isolation", () => {
  it("a profile whose tenant does not match the request throws TENANT_MISMATCH", () => {
    expect(() => compileTemplate(manifestRaw, profileRaw, { tenant: "happy-place", ownerObjectId: "x" })).toThrow(/does not match/);
  });
  it("no cross-call state: A, B, A compiles leave A byte-identical", () => {
    const a1 = compile();
    const synthetic = JSON.parse(JSON.stringify(profileRaw));
    synthetic.tenant = "synthetic-tenant";
    synthetic.fields.tagline = { status: "VERIFIED", value: "A totally different tagline." };
    const b = compileTemplate(manifestRaw, synthetic, { tenant: "synthetic-tenant", ownerObjectId: "website-business-synthetic" });
    expect(JSON.stringify(b.spec).includes("totally different tagline")).toBe(true);
    expect(JSON.stringify(b.spec).includes("need a Coppersmith")).toBe(false);
    const a2 = compile();
    expect(canonicalStringify(a2.spec)).toBe(canonicalStringify(a1.spec));
  });
  it("mutating the input profile after compile does not change the compiled spec", () => {
    const mutable = JSON.parse(JSON.stringify(profileRaw));
    const a = compileTemplate(manifestRaw, mutable, OPTS);
    const before = canonicalStringify(a.spec);
    mutable.fields.tagline.value = "MUTATED AFTER COMPILE";
    mutable.fields.services.value = [];
    expect(canonicalStringify(a.spec)).toBe(before);
  });
});

describe("6. archetype pass-through", () => {
  it("compiled spec carries TRADES and survives applyArchetype with no page loss", () => {
    const { spec } = compile();
    expect(spec.archetype).toBe("TRADES");
    const again = applyArchetype(spec, TRADES_PROFILE);
    expect(again.pages.length).toBe(spec.pages.length);
    const findings = validateSiteSpec(again, KNOWN_SCHEMAS);
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("report shape", () => {
  it("declares forms as functional components with tenant-bound destinations", () => {
    const { report } = compile();
    const kinds = report.functionalComponents.map((f) => f.kind);
    expect(kinds).toContain("estimate-wizard");
    expect(kinds).toContain("newsletter-signup");
    for (const f of report.functionalComponents) {
      expect(f.destinationBinding.length).toBeGreaterThan(0);
    }
    expect(report.sectionsInexpressible.some((s) => s.section === "EstimateWizard")).toBe(true);
    // TrustStrip was pinned here as inexpressible until the B3C
    // tranche mapped it; EstimateWizard remains inexpressible.
    expect(report.sectionsInexpressible.some((s) => s.section === "TrustStrip")).toBe(false);
  });
});

describe("7. B3B section coverage: Footer, Eyebrow, H1", () => {
  it("the three kinds are no longer inexpressible, and serviceDetail is fully expressible", () => {
    const { report } = compile();
    const kinds = new Set(report.sectionsInexpressible.map((s) => s.needsComponent));
    expect(kinds.has("Footer")).toBe(false);
    expect(kinds.has("Eyebrow")).toBe(false);
    expect(kinds.has("H1")).toBe(false);
    // The fixture baseline carried 34 inexpressible instances; these
    // three kinds close 19 of them (Footer 7, Eyebrow 6, H1 6), and
    // the B3C tranche closes 5 more (TrustStrip 2, AttributeStrip 1,
    // AncillaryList 1, NewsletterSection 1), leaving 10.
    expect(report.sectionsInexpressible.length).toBe(10);
    expect(report.sectionsInexpressible.filter((s) => s.page === "serviceDetail")).toEqual([]);
  });
  it("every serviceDetail page carries the eyebrow label, the record name as its H1, and a footer", () => {
    const { spec } = compile();
    const detail = spec.pages.filter((p) => p.slug.startsWith("services/"));
    expect(detail.length).toBe(6);
    for (const page of detail) {
      const headings = page.sections.map((s) => s.presentation.heading);
      expect(headings).toContain("Services");
      expect(headings).toContain(page.title);
      const footer = page.sections.find(
        (s) => s.component === "Contact" && s.presentation.heading === "COPPERSMITH PLUMBING COMPANY, INC.",
      );
      expect(footer).toBeDefined();
      expect(footer?.presentation.copy).toContain("970-245-3869");
      expect(footer?.presentation.copy).toContain("Western Colorado");
    }
  });
  it("the home footer binds the legal name because the display name is CONFLICTED", () => {
    const { spec } = compile();
    const home = spec.pages.find((p) => p.slug === "home");
    const footer = home?.sections.find((s) => s.component === "Contact");
    expect(footer?.presentation.heading).toBe("COPPERSMITH PLUMBING COMPANY, INC.");
    expect(footer?.presentation.copy).toBe(
      "Call 970-245-3869 · Serving Western Colorado (Grand Valley, Western Slope, Mesa County); based in Grand Junction, Colorado",
    );
  });
  it("Eyebrow and H1 omit on a non-record page, and Footer omits when no brand or contact field binds", () => {
    const manifest = JSON.parse(JSON.stringify(manifestRaw));
    const homePage = manifest.pages.find((p: { id: string }) => p.id === "home");
    homePage.sections = ["Eyebrow", "H1", "Footer"];
    const profile = JSON.parse(JSON.stringify(profileRaw));
    for (const f of ["display_name", "legal_name", "phone", "service_area"]) {
      profile.fields[f] = { status: "UNKNOWN", value: null };
    }
    const { spec, report } = compileTemplate(manifest, profile, OPTS);
    const omitted = new Set(report.sectionsOmitted.map((s) => s.section));
    expect(omitted.has("Eyebrow")).toBe(true);
    expect(omitted.has("H1")).toBe(true);
    expect(omitted.has("Footer")).toBe(true);
    expect(spec.pages.find((p) => p.slug === "home")?.sections).toEqual([]);
  });
  it("Footer still emits from the phone alone when the name and service area cannot bind", () => {
    const profile = JSON.parse(JSON.stringify(profileRaw));
    for (const f of ["display_name", "legal_name", "service_area"]) {
      profile.fields[f] = { status: "UNKNOWN", value: null };
    }
    const { spec } = compileTemplate(manifestRaw, profile, OPTS);
    const home = spec.pages.find((p) => p.slug === "home");
    const footer = home?.sections.find((s) => s.component === "Contact");
    expect(footer).toBeDefined();
    expect(footer?.presentation.heading).toBeUndefined();
    expect(footer?.presentation.copy).toBe("Call 970-245-3869");
  });
  it("the Footer, Eyebrow, and H1 sections are byte-identical across two compiles", () => {
    const a = compile();
    const b = compile();
    const extract = (spec: typeof a.spec) => {
      const out: unknown[] = [];
      for (const page of spec.pages) {
        for (const s of page.sections) {
          const h = s.presentation.heading;
          if (h === "Services" || h === page.title || h === "COPPERSMITH PLUMBING COMPANY, INC.") out.push(s);
        }
      }
      return out;
    };
    // 6 eyebrows + 6 record-name H1s + 7 footers.
    expect(extract(a.spec).length).toBe(19);
    expect(canonicalStringify(extract(a.spec))).toBe(canonicalStringify(extract(b.spec)));
    expect(a.report.determinismKey).toBe(b.report.determinismKey);
  });
});

describe("8. B3C section coverage: TrustStrip, AttributeStrip, AncillaryList, NewsletterSection", () => {
  it("the four kinds are no longer inexpressible, and exactly the out-of-scope kinds remain", () => {
    const { report } = compile();
    const kinds = new Set(report.sectionsInexpressible.map((s) => s.needsComponent));
    for (const k of ["TrustStrip", "AttributeStrip", "AncillaryList", "NewsletterSection"]) {
      expect(kinds.has(k)).toBe(false);
    }
    // 34 baseline - 19 (B3B) - 5 (B3C) = 10 remaining: the five class
    // (a) source-data absences, AggregateSlot (class c), EstimateWizard,
    // and the Collect / Use / DataContact privacy bundle, whose
    // treatment is an open desk judgment outside this tranche.
    expect(report.sectionsInexpressible.length).toBe(10);
    expect([...kinds].sort()).toEqual([
      "AggregateSlot",
      "BeforeAfter",
      "Collect",
      "DataContact",
      "EstimateWizard",
      "ExpandableQAList",
      "FeaturedReview",
      "ProjectStoryTeaser",
      "ReviewCardGrid+Filter",
      "Use",
    ]);
  });
  it("TrustStrip carries the VERIFIED claims on home and work, and never the credentials evidence prose", () => {
    const { spec } = compile();
    const expected = (profileRaw.fields.business_claims.value as string[]).join(" · ");
    const withCopy = (slug: string) =>
      spec.pages.find((p) => p.slug === slug)?.sections.filter((s) => s.presentation.copy === expected) ?? [];
    // Home: the strip and SocialProof itself bind the same claims.
    expect(withCopy("home").length).toBe(2);
    // Work: the strip is the only claims carrier on the page.
    expect(withCopy("work").length).toBe(1);
    expect(withCopy("work")[0].component).toBe("SocialProof");
    const json = JSON.stringify(spec);
    expect(json.includes("licensed contractors list")).toBe(false);
    expect(json.includes("Bob Kleeman")).toBe(false);
  });
  it("AttributeStrip omits when no attribute binds (fixture: years CONFLICTED + DO_NOT_BIND, founded UNKNOWN)", () => {
    const { report } = compile();
    const omitted = new Set(report.sectionsOmitted.map((s) => s.section));
    // Omission records carry the raw manifest token, optional marker
    // included (cf. "PeopleTeaser?" in the baseline reports).
    expect(omitted.has("AttributeStrip?")).toBe(true);
  });
  it("AttributeStrip binds years and founding year where the profile verifies them", () => {
    const profile = JSON.parse(JSON.stringify(profileRaw));
    profile.fields.years_in_business = { status: "VERIFIED", value: "40 years" };
    profile.fields.founded_year = { status: "VERIFIED", value: "1985" };
    const { spec } = compileTemplate(manifestRaw, profile, OPTS);
    const home = spec.pages.find((p) => p.slug === "home");
    const strip = home?.sections.find((s) => s.presentation.copy === "40 years · Since 1985");
    expect(strip).toBeDefined();
    expect(strip?.component).toBe("SocialProof");
  });
  it("AncillaryList is a second Services section on the services index, from the same verified list", () => {
    const { spec } = compile();
    const index = spec.pages.find((p) => p.slug === "services");
    const services = index?.sections.filter((s) => s.component === "Services") ?? [];
    expect(services.length).toBe(2);
    expect(canonicalStringify(services[0].query)).toBe(canonicalStringify(services[1].query));
  });
  it("NewsletterSection places a Newsletter CTA on home while the signup still travels as a functional component", () => {
    const { spec, report } = compile();
    const home = spec.pages.find((p) => p.slug === "home");
    const placement = home?.sections.find((s) => s.component === "CTA" && s.presentation.heading === "Newsletter");
    expect(placement).toBeDefined();
    expect(report.functionalComponents.map((f) => f.kind)).toContain("newsletter-signup");
  });
  it("the four kinds' sections are byte-identical across two compiles", () => {
    const a = compile();
    const b = compile();
    const extract = (spec: typeof a.spec) => {
      const out: unknown[] = [];
      for (const page of spec.pages) {
        for (const s of page.sections) {
          if (s.presentation.heading === "Newsletter") out.push(s);
          if (page.slug === "work" && s.component === "SocialProof") out.push(s);
          if (page.slug === "services" && s.component === "Services") out.push(s);
        }
      }
      return out;
    };
    // Work TrustStrip 1 + services-index Services sections 2 (card
    // grid and ancillary list) + home Newsletter CTA 1.
    expect(extract(a.spec).length).toBe(4);
    expect(canonicalStringify(extract(a.spec))).toBe(canonicalStringify(extract(b.spec)));
    expect(a.report.determinismKey).toBe(b.report.determinismKey);
  });
});
