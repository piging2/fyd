/**
 * Tests for deterministic body-contact mining (2026-09-30).
 * Address fixtures are verbatim strings observed on the five
 * falsification-battery sites (2026-09-30).
 */
import {
  mineBodyContactFacts,
  BODY_CONTACT_EXTRACTOR,
  ADDRESS_RE,
} from "../body-contact";
import type { ParsedFact } from "../proceduralizer";

function factNamed(facts: ParsedFact[], name: string): ParsedFact | undefined {
  return facts.find((f) => f.name === name);
}

describe("mineBodyContactFacts: phone", () => {
  test("mines a phone from body text with html sourceType and extractor label", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Call us: (970)-858-0938</p></body></html>",
      "https://kimsautopart.com/",
    );
    const phone = factNamed(facts, "phone");
    expect(phone).toBeDefined();
    expect(phone!.value).toEqual(["(970)-858-0938"]);
    expect(phone!.sourceType).toBe("html");
    expect(phone!.factClass).toBe("DIRECT_FACT");
    expect(phone!.visibility).toBe("public");
    expect(phone!.extractor).toBe(BODY_CONTACT_EXTRACTOR);
  });

  test("dedupes identical numbers across formats, keeps document order", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Contact Number 970-858-5015</p>" +
        "<footer>Phone (970) 858-5015</footer></body></html>",
      "http://www.wickedwrenchdieselauto.com/",
    );
    expect(factNamed(facts, "phone")!.value).toEqual(["970-858-5015"]);
  });

  test("keeps distinct numbers", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>970-314-7455 or 970-314-9736</p></body></html>",
      "http://www.bin707.com",
    );
    expect(factNamed(facts, "phone")!.value).toEqual([
      "970-314-7455",
      "970-314-9736",
    ]);
  });

  test("ignores digit runs inside scripts and comments (hostile input)", () => {
    const facts = mineBodyContactFacts(
      "<html><head><script>var x = '970-111-2222';</script></head>" +
        "<body><!-- 970-333-4444 --><p>No phone here</p></body></html>",
      "https://example.com/",
    );
    expect(factNamed(facts, "phone")).toBeUndefined();
  });

  test("no phone fact when none present", () => {
    expect(mineBodyContactFacts("<html><body><p>Hi</p></body></html>", "https://example.com/")).toEqual([]);
  });
});

describe("mineBodyContactFacts: address (falsification strings)", () => {
  test("Kim's punctuation-light form", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Visit us in-store, 220 E. Aspen Ave. Fruita CO. 81521</p></body></html>",
      "https://kimsautopart.com/",
    );
    const a = factNamed(facts, "address");
    expect(a).toBeDefined();
    expect(a!.value).toBe("220 E. Aspen Ave. Fruita CO. 81521");
  });

  test("Elevation unit designator", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Our Location 1190 Bookcliff Ave, Unit 101 Grand Junction, CO 81501</p></body></html>",
      "https://www.elevationfamilydental.com/",
    );
    expect(factNamed(facts, "address")!.value).toBe(
      "1190 Bookcliff Ave, Unit 101 Grand Junction, CO 81501",
    );
  });

  test("Wicked Wrench highway form", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Address 825 East US Hwy 6&50 Fruita, CO 81521</p></body></html>",
      "http://www.wickedwrenchdieselauto.com/",
    );
    expect(factNamed(facts, "address")!.value).toBe(
      "825 East US Hwy 6&50 Fruita, CO 81521",
    );
  });

  test("letter street", () => {
    const facts = mineBodyContactFacts(
      "<html><body><footer>1234 G Rd, Grand Junction, CO 81501</footer></body></html>",
      "https://example.com/",
    );
    expect(factNamed(facts, "address")!.value).toBe(
      "1234 G Rd, Grand Junction, CO 81501",
    );
  });

  test("bin707 footer address without ZIP is conservatively skipped", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Top Bin 707 is located at 400 Main St. Grand Junction, CO 970-314-7455</p></body></html>",
      "http://www.bin707.com",
    );
    expect(factNamed(facts, "address")).toBeUndefined();
    // phone still mined
    expect(factNamed(facts, "phone")!.value).toEqual(["970-314-7455"]);
  });

  test("bin707 relocation note without ZIP is conservatively skipped", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>Bin 707 relocated to 400 Main Street in Downtown Grand Junction, Colorado.</p></body></html>",
      "http://www.bin707.com",
    );
    expect(factNamed(facts, "address")).toBeUndefined();
  });

  test("bare street without city/state/ZIP is skipped", () => {
    const facts = mineBodyContactFacts(
      "<html><body><p>@TACOPARTYGJ 126 S. 5th St. 970-314-9736</p></body></html>",
      "http://www.bin707.com",
    );
    expect(factNamed(facts, "address")).toBeUndefined();
  });

  test("conflict: footer-labeled block wins over earlier body candidate", () => {
    const facts = mineBodyContactFacts(
      "<html><body>" +
        "<p>We moved! Old shop was 999 Old Mill Rd, Fruita, CO 81521.</p>" +
        "<footer>Visit us at 220 E. Aspen Ave. Fruita CO. 81521</footer>" +
        "</body></html>",
      "https://example.com/",
    );
    const a = factNamed(facts, "address")!;
    expect(a.value).toBe("220 E. Aspen Ave. Fruita CO. 81521");
    expect(a.evidenceDetail).toContain("candidates=2");
    expect(a.evidenceDetail).toContain("labeled=1");
    expect(a.evidenceDetail).toContain("policy=labeled-block");
  });

  test("conflict: first in document order wins when nothing is labeled", () => {
    const facts = mineBodyContactFacts(
      "<html><body>" +
        "<p>999 Old Mill Rd, Fruita, CO 81521 is the old shop.</p>" +
        "<p>New shop: 220 E. Aspen Ave. Fruita CO. 81521</p>" +
        "</body></html>",
      "https://example.com/",
    );
    const a = factNamed(facts, "address")!;
    expect(a.value).toBe("999 Old Mill Rd, Fruita, CO 81521");
    expect(a.evidenceDetail).toContain("policy=document-order");
  });

  test("never merges two addresses into one string", () => {
    const facts = mineBodyContactFacts(
      "<html><body>" +
        "<p>999 Old Mill Rd, Fruita, CO 81521</p>" +
        "<footer>220 E. Aspen Ave. Fruita CO. 81521</footer>" +
        "</body></html>",
      "https://example.com/",
    );
    const v = String(factNamed(facts, "address")!.value);
    expect(v).not.toContain("Old Mill Rd, Fruita, CO 81521 220");
    expect(v).not.toContain("81521, 220");
  });
});

describe("ADDRESS_RE: unit-designator boundary (elevationfamilydental 2026-09-30)", () => {
  function allMatches(text: string): string[] {
    return [...text.matchAll(new RegExp(ADDRESS_RE.source, "g"))].map((m) => m[0]);
  }

  test("spaced unit still matches, unit value is 101 not 101Grand", () => {
    const good = "1190 Bookcliff Ave, Unit 101 Grand Junction, CO 81501";
    const m = allMatches(good);
    expect(m).toEqual([good]);
    expect(m[0]).toContain("Unit 101 Grand Junction");
    expect(m[0]).not.toContain("101Grand");
  });

  test("tag-boundary-collapsed Unit 101Grand Junction yields no address (fail closed)", () => {
    // node-html-parser .text concatenates
    // <p>1190 Bookcliff Ave, Unit 101</p><p>Grand Junction, CO 81501</p>
    // with no separator. The greedy unit value must not absorb the glued
    // city word into a malformed second address.
    expect(allMatches("1190 Bookcliff Ave, Unit 101Grand Junction, CO 81501")).toEqual([]);
  });

  test("other unit forms unaffected: Apt 4B, Suite 200A, Unit B-204", () => {
    for (const text of [
      "456 Main St, Apt 4B Denver, CO 80202",
      "789 Oak Ave, Suite 200A Denver, CO 80202",
      "321 Pine Rd, Unit B-204 Denver, CO 80202",
    ]) {
      expect(allMatches(text)).toEqual([text]);
    }
  });
});
