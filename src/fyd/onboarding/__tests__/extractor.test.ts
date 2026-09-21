/**
 * Regression tests for the evidence extractor: reads what a page says,
 * never infers. Hostile fixtures (script-injected contact facts) must not
 * leak into evidence.
 */
import { extractPageEvidence } from "../extractor";

const BUSINESS_HTML = `<!DOCTYPE html><html><head>
<title>Acme Plumbing - Grand Junction, CO</title>
<meta name="description" content="Family-owned plumbing since 1998.">
<meta property="og:title" content="OG Title Should Lose">
<script type="application/ld+json">
{"@type":"Plumber","name":"Acme Plumbing","telephone":"(970) 555-0142",
 "address":{"streetAddress":"123 Main St","addressLocality":"Grand Junction","addressRegion":"CO","postalCode":"81501"},
 "openingHours":["Mo-Fr 08:00-17:00"]}
</script>
<script>var fakePhone = "(303) 555-9999"; var fakeMail = "evil@attacker.example";</script>
</head><body>
<h1>Acme Plumbing</h1>
<h2>Our Services</h2>
<ul><li>Water heaters</li><li>Drain cleaning</li><li>Water heaters</li></ul>
<p>Call <a href="tel:+19705550142">us</a> or <a href="mailto:hello@acmeplumb.example">email</a>.</p>
<p>Visit our <a href="https://www.facebook.com/acmeplumb">Facebook</a>.</p>
</body></html>`;

describe("extractPageEvidence", () => {
  test("extracts title, description, headings, and JSON-LD facts", () => {
    const e = extractPageEvidence(BUSINESS_HTML, "https://acmeplumb.example/");
    expect(e.title).toBe("Acme Plumbing - Grand Junction, CO");
    expect(e.description).toBe("Family-owned plumbing since 1998.");
    expect(e.headings).toContain("Acme Plumbing");
    expect(e.headings).toContain("Our Services");
    expect(e.address).toBe("123 Main St, Grand Junction, CO, 81501");
    expect(e.hours).toContain("Mo-Fr 08:00-17:00");
    expect(e.services).toEqual(["Water heaters", "Drain cleaning"]);
  });
  test("prefers tel:/mailto: links, ignores script-injected fakes", () => {
    const e = extractPageEvidence(BUSINESS_HTML, "https://acmeplumb.example/");
    expect(e.phone).toBe("+19705550142");
    expect(e.email).toBe("hello@acmeplumb.example");
    expect(e.phone).not.toContain("303");
    expect(e.email).not.toContain("attacker");
  });
  test("collects social links", () => {
    const e = extractPageEvidence(BUSINESS_HTML, "https://acmeplumb.example/");
    expect(e.social).toContain("https://www.facebook.com/acmeplumb");
  });
  test("missing fields are null/empty, never invented", () => {
    const e = extractPageEvidence("<html><head></head><body><p>Hi</p></body></html>", "https://x.example/");
    expect(e.title).toBeNull();
    expect(e.description).toBeNull();
    expect(e.phone).toBeNull();
    expect(e.email).toBeNull();
    expect(e.address).toBeNull();
    expect(e.headings).toEqual([]);
    expect(e.services).toEqual([]);
  });
  test("malformed JSON-LD is not evidence", () => {
    const html = '<html><head><script type="application/ld+json">{broken</script></head><body><h1>T</h1></body></html>';
    const e = extractPageEvidence(html, "https://x.example/");
    expect(e.headings).toEqual(["T"]);
    expect(e.address).toBeNull();
  });
});
