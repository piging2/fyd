/**
 * Eight-dimension archetype space: determinism, validity, and the
 * roofer vs emergency-plumber information-architecture bar.
 */
import {
  COPPERSMITH_VECTOR,
  NAMED_PRESET_VECTORS,
  PING_DOGFOOD_VECTOR,
  nearestPresetName,
  policyForVector,
  quantizeVector,
  validateVector,
  type ArchetypeVector,
} from "../dimensions";

const ROOFER: ArchetypeVector = {
  urgency: 0.3,
  trust_requirement: 0.8,
  technical_depth: 0.25,
  human_prominence: 0.55,
  media_density: 0.55,
  service_complexity: 0.6,
  locality: 0.9,
  evidence_density: 0.5,
};

const EMERGENCY_PLUMBER: ArchetypeVector = {
  urgency: 0.95,
  trust_requirement: 0.7,
  technical_depth: 0.2,
  human_prominence: 0.5,
  media_density: 0.5,
  service_complexity: 0.3,
  locality: 0.9,
  evidence_density: 0.5,
};

function rankOrder(policy: ReturnType<typeof policyForVector>, components: string[]): string[] {
  const base = [
    "Hero", "IdentityCard", "BusinessSummary", "Services", "Products",
    "SocialProof", "Locations", "People", "Posts", "ObjectFeed",
    "RecentObjects", "ObjectGrid", "Contact", "Links", "CTA", "AskFYD",
    "GenericObjectCard",
  ];
  const indexed = components.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => {
    const ra = base.indexOf(a.c) - (policy.sectionBoosts[a.c] ?? 0);
    const rb = base.indexOf(b.c) - (policy.sectionBoosts[b.c] ?? 0);
    return ra !== rb ? ra - rb : a.i - b.i;
  });
  return indexed.map((x) => x.c);
}

describe("archetype dimensions", () => {
  test("same vector -> byte-identical policy", () => {
    const a = JSON.stringify(policyForVector(COPPERSMITH_VECTOR));
    const b = JSON.stringify(policyForVector({ ...COPPERSMITH_VECTOR }));
    expect(a).toBe(b);
  });

  test("float noise below quantization never changes the policy", () => {
    const noisy = { ...COPPERSMITH_VECTOR, urgency: 0.8500000001 };
    expect(JSON.stringify(policyForVector(noisy))).toBe(
      JSON.stringify(policyForVector(COPPERSMITH_VECTOR)),
    );
  });

  test("invalid vectors fail closed", () => {
    const bad = { ...COPPERSMITH_VECTOR, urgency: NaN };
    expect(() => validateVector(bad)).toThrow(/Invalid archetype vector/);
    expect(() => validateVector({ ...COPPERSMITH_VECTOR, locality: 1.5 })).toThrow();
    expect(() => policyForVector({ ...COPPERSMITH_VECTOR, urgency: -0.1 })).toThrow();
  });

  test("quantizeVector is deterministic and bounded", () => {
    const q = quantizeVector({ ...COPPERSMITH_VECTOR, urgency: 1 / 3 });
    expect(q.urgency).toBe(0.333);
  });

  test("roofer vs emergency plumber: different information architecture", () => {
    const home = ["Hero", "BusinessSummary", "Services", "Locations", "Contact", "Links", "AskFYD"];
    const rooferOrder = rankOrder(policyForVector(ROOFER), home);
    const plumberOrder = rankOrder(policyForVector(EMERGENCY_PLUMBER), home);
    // The emergency plumber surfaces Contact far earlier than the roofer.
    expect(rooferOrder).not.toEqual(plumberOrder);
    expect(plumberOrder.indexOf("Contact")).toBeLessThan(rooferOrder.indexOf("Contact"));
    // Sanity: Hero still leads both.
    expect(rooferOrder[0]).toBe("Hero");
    expect(plumberOrder[0]).toBe("Hero");
  });

  test("the two tenant operating points compose differently", () => {
    const dogfood = policyForVector(PING_DOGFOOD_VECTOR);
    const copper = policyForVector(COPPERSMITH_VECTOR);
    expect(dogfood.presenceMode).toBe("drawer"); // expert audience
    expect(copper.presenceMode).toBe("auto");
    expect(dogfood.density).toBe("compact");
    expect(copper.density).not.toBe("compact");
    expect(dogfood.ctaEmphasis).not.toBe(copper.ctaEmphasis);
  });

  test("named presets are vocabulary: nearest name is stable", () => {
    expect(nearestPresetName(PING_DOGFOOD_VECTOR)).toBe("TECHNICAL_ENTERPRISE");
    expect(nearestPresetName(COPPERSMITH_VECTOR)).toBe("TRADES");
    // Every named preset maps to itself.
    for (const name of Object.keys(NAMED_PRESET_VECTORS) as (keyof typeof NAMED_PRESET_VECTORS)[]) {
      expect(nearestPresetName(NAMED_PRESET_VECTORS[name])).toBe(name);
    }
  });
});
