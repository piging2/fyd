/**
 * Tests for the person role gate (2026-09-30): a Person entity projects
 * to a ping.social.person@1 object only when it carries a job_title
 * field OR participates in a person-role relationship
 * (ROLE_PREDICATES.person). Blog authors ("Admin") and headline-only
 * nodes ("Welcome to our blog") are gated out.
 */
import { runExtractionPipeline } from "../proceduralizer";

const TS = "2026-09-30T12:00:00.000Z";

function page(url: string, html: string) {
  return {
    url,
    sourceType: "html" as const,
    discoveredAt: TS,
    raw: html,
    ok: true,
    status: 200,
  };
}

const HTML = `<!DOCTYPE html><html><head>
<title>TestCo Services</title>
<meta property="og:title" content="TestCo Services" />
<meta property="og:description" content="TestCo Services does great work in town." />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "LocalBusiness", "@id": "https://testco.example/#biz",
      "name": "TestCo Services",
      "employee": { "@id": "https://testco.example/#jane" } },
    { "@type": "Person", "@id": "https://testco.example/#jane",
      "name": "Jane Doe", "jobTitle": "Owner" },
    { "@type": "Person", "@id": "https://testco.example/#admin",
      "name": "Admin" },
    { "@type": "BlogPosting", "@id": "https://testco.example/#post",
      "headline": "Shop news", "author": { "@id": "https://testco.example/#admin" } },
    { "@type": "Person", "@id": "https://testco.example/#ghost",
      "headline": "Welcome to our blog" },
    { "@type": "Person", "@id": "https://testco.example/#bob",
      "name": "Bob Smith", "worksFor": { "@id": "https://testco.example/#biz" } }
  ]
}
</script>
</head><body><h1>TestCo</h1></body></html>`;

async function run() {
  const out = await runExtractionPipeline(
    [page("https://testco.example/", HTML)],
    {
      sourceUrl: "https://testco.example/",
      observedAt: TS,
      controllerId: "runner-test",
    } as never,
  );
  return out.graph.objects.filter((o) => o.schema === "ping.social.person@1");
}

describe("person role gate", () => {
  test("gates out the blog author (Admin, authored_by is not a person-role predicate)", async () => {
    const persons = await run();
    expect(persons.map((p) => p.title)).not.toContain("Admin");
  });

  test("gates out the headline-only node", async () => {
    const persons = await run();
    expect(persons.map((p) => p.title)).not.toContain("Welcome to our blog");
  });

  test("keeps the jobTitle person (employee + Owner)", async () => {
    const persons = await run();
    const jane = persons.find((p) => p.title === "Jane Doe");
    expect(jane).toBeDefined();
    expect(jane!.fields["job_title"]).toBe("Owner");
  });

  test("keeps the works_for person (Bob Smith, no jobTitle)", async () => {
    const persons = await run();
    expect(persons.map((p) => p.title)).toContain("Bob Smith");
  });

  test("gate is deterministic across runs", async () => {
    const a = (await run()).map((p) => p.title).sort();
    const b = (await run()).map((p) => p.title).sort();
    expect(a).toEqual(b);
  });
});
