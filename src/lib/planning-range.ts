/**
 * Customer-facing Preliminary Planning Range (P3 — the "planning assistant").
 *
 * This is intentionally NOT an official quote. It is a conservative planning
 * estimate biased ~12% high so the formal quote is often pleasantly lower.
 * The authoritative Oregon cost knowledge lives in /internal/knowledge (the
 * EstimateEngine). These seed figures mirror that knowledge for the live,
 * static site and are replaced by the engine once it is wired in.
 */

export type ServiceSlug = string;

export type EstimationStrategy = "flat" | "per-unit" | "scope-based" | "composite";

export interface ServiceSeed {
  label: string;
  /** [low, high] planning range in dollars, before the +12% bias */
  range: [number, number];
  /** per-unit hint shown under the summary */
  unit?: { per: number; label: string };
  /** NEW — optional scope-keyed sub-ranges. Falls back to `range` if absent */
  scopeRanges?: Record<string, [number, number]>;
  /** NEW — optional per-unit rate */
  unitRate?: [number, number];
  /** NEW — optional modifiers applied multiplicatively */
  modifiers?: { id: string; label: string; multiplier: number }[];
  /** NEW — base confidence before dynamic adjustment */
  baseConfidence?: "low" | "medium" | "high";
  /** NEW — estimation strategy */
  strategy?: EstimationStrategy;
}

export const SEEDS: Record<ServiceSlug, ServiceSeed> = {
  fences: { 
    label: "cedar privacy fence", 
    range: [4800, 8800], 
    unit: { per: 50, label: "linear ft" },
    strategy: "per-unit",
    unitRate: [35, 58], // $35-58 per linear ft (tightened to market)
    scopeRanges: {
      "New fence": [6000, 12000],
      "Repair (1-3 sections)": [400, 1400],
      "Full replacement": [5000, 10000],
    },
    baseConfidence: "high",
  },
  decks: { 
    label: "deck", 
    range: [11000, 20000], 
    unit: { per: 70, label: "sq ft" },
    strategy: "per-unit",
    unitRate: [35, 65], // $35-65 per sq ft (tightened to market)
    scopeRanges: {
      "New build": [12000, 22000],
      "Repair / board replacement": [3000, 8000],
      "Resurface / re-stain only": [1200, 4500],
    },
    baseConfidence: "high",
  },
  pergolas: { label: "pergola / outdoor structure", range: [4500, 10500], strategy: "flat" },
  bathrooms: { 
    label: "bathroom remodel", 
    range: [10000, 26000], 
    strategy: "scope-based",
    scopeRanges: {
      "Full remodel": [12000, 35000],
      "Shower/tub only": [6000, 18000],
      "Vanity + fixtures": [5000, 15000],
      "Tile + paint": [7000, 20000],
      "Not sure": [10000, 26000],
    },
    baseConfidence: "high",
  },
  restoration: { 
    label: "historic home restoration", 
    range: [15000, 50000], 
    strategy: "scope-based",
    scopeRanges: {
      "Full restoration": [20000, 70000],
      "Partial restoration": [10000, 30000],
      "Not sure": [15000, 50000],
    },
    baseConfidence: "low",
  },
  "built-ins": { 
    label: "built-ins & trim", 
    range: [3000, 8500], 
    strategy: "scope-based",
    scopeRanges: {
      "Single small piece": [800, 2500],
      "Multi-piece project": [3000, 12000],
    },
    baseConfidence: "medium",
  },
  "outdoor-living": { 
    label: "outdoor living", 
    range: [4500, 10500], 
    strategy: "scope-based",
    scopeRanges: {
      "Pergola / courtyard": [4500, 10500],
      "Patio / hardscape": [3000, 8000],
      "Not sure": [4500, 10500],
    },
    baseConfidence: "medium",
  },
  flooring: { 
    label: "flooring installation", 
    range: [3000, 9000], 
    strategy: "scope-based",
    scopeRanges: {
      "Hardwood": [4000, 12000],
      "Laminate / LVP": [2000, 6000],
      "Tile": [3000, 8000],
      "Not sure": [3000, 9000],
    },
    baseConfidence: "medium",
  },
  repairs: { label: "repair / handyman work", range: [500, 4000], strategy: "scope-based", scopeRanges: { "Quick single task (under 2 hrs)": [150, 500], "Small repair (2-5 hrs)": [500, 1500], "Larger repair (1-2 days)": [1500, 4000], "Not sure": [500, 4000] }, baseConfidence: "medium" },
  painting: { 
    label: "painting & finishing", 
    range: [2000, 8000], 
    strategy: "scope-based",
    scopeRanges: {
      "Interior painting": [1500, 6000],
      "Exterior painting": [2500, 10000],
      "Cabinet refinishing": [1000, 4000],
      "Not sure": [2000, 8000],
    },
    baseConfidence: "medium",
  },
  "finish-carpentry": { 
    label: "finish carpentry", 
    range: [1500, 5000], 
    strategy: "scope-based",
    scopeRanges: {
      "Trim & molding": [1000, 3500],
      "Custom millwork": [2000, 6000],
      "Not sure": [1500, 5000],
    },
    baseConfidence: "medium",
  },
};

const HIGH_BIAS = 1.12; // conservative upward bias

export interface PlanningResult {
  labels: string[];
  low: number;
  high: number;
  note: string;
  // NEW — breakdown, confidence, assumptions, missingInputs
  breakdown?: {
    service: ServiceSlug;
    label: string;
    low: number;
    high: number;
    strategy: EstimationStrategy;
    scopeUsed?: string;
    measurementUsed?: { answerId: string; value: number; unit: string };
  }[];
  confidence?: "low" | "medium" | "high";
  assumptions?: string[];
  missingInputs?: string[];
}


export function formatRange(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function preliminaryRange(
  services: string[],
  answers?: Record<string, string | boolean | number>
): PlanningResult {
  if (services.length === 0) {
    return {
      labels: [],
      low: 0,
      high: 0,
      note: "Please select at least one service",
    };
  }

  const breakdown: PlanningResult["breakdown"] = [];
  let totalLow = 0;
  let totalHigh = 0;
  const assumptions: string[] = [];
  const missingInputs: string[] = [];

  for (const slug of services) {
    const seed = SEEDS[slug];
    if (!seed) {
      console.warn(`No seed found for service: ${slug}`);
      continue;
    }

    let low = seed.range[0];
    let high = seed.range[1];
    let scopeUsed: string | undefined;
    let measurementUsed: { answerId: string; value: number; unit: string } | undefined;

    // Use scopeRanges if answers provide scope information
    if (seed.scopeRanges && answers) {
      for (const [scopeKey, scopeRange] of Object.entries(seed.scopeRanges)) {
        // Check if any answer matches this scope
        const answerValue = Object.values(answers).find(
          (v) => typeof v === "string" && v === scopeKey
        );
        if (answerValue) {
          low = scopeRange[0];
          high = scopeRange[1];
          scopeUsed = scopeKey;
          break;
        }
      }
    }

    // Apply per-unit pricing if unitRate and measurement answers exist
    if (seed.unitRate && answers && seed.strategy === "per-unit") {
      const measurementKey = Object.keys(answers).find((k) =>
        k.includes("footage") || k.includes("length") || k.includes("size")
      );
      if (measurementKey) {
        const measurement = answers[measurementKey];
        if (typeof measurement === "string") {
          const value = parseFloat(measurement.replace(/[^0-9.]/g, ""));
          if (!isNaN(value) && value > 0) {
            low = seed.unitRate[0] * value;
            high = seed.unitRate[1] * value;
            measurementUsed = {
              answerId: measurementKey,
              value,
              unit: seed.unit?.label || "units",
            };
          }
        }
      }
    }

    breakdown.push({
      service: slug,
      label: seed.label,
      low,
      high,
      strategy: seed.strategy || "flat",
      scopeUsed,
      measurementUsed,
    });

    totalLow += low;
    totalHigh += high;
  }

  // Apply high bias
  const biasedLow = totalLow;
  const biasedHigh = totalHigh * HIGH_BIAS;

  // Determine overall confidence
  const confidence: "medium" | "high" =
    breakdown.some((b) => b.strategy === "per-unit")
      ? "high"
      : "medium";

  // Build note
  let note = "This is a preliminary planning range, not a formal quote.";
  if (services.length > 1) {
    note += " Because you selected more than one project type, this range reflects all of them combined.";
  }
  if (confidence === "medium" && breakdown.some((b) => b.strategy === "scope-based")) {
    note += " Due to the complexity of this project, we recommend an on-site consultation for an accurate quote.";
  }

  return {
    labels: breakdown.map((b) => b.label),
    low: Math.round(biasedLow),
    high: Math.round(biasedHigh),
    note,
    breakdown,
    confidence,
    assumptions: assumptions.length > 0 ? assumptions : undefined,
    missingInputs: missingInputs.length > 0 ? missingInputs : undefined,
  };
}
