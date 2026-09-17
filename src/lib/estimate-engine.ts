/**
 * Estimate Engine — authoritative execution path for all estimates.
 *
 * This is the single pipeline through which every estimate must flow:
 *   EstimateRequest → PlanningContext → evaluateStrategy() → PlanningResult
 *
 * No duplicate estimators. No bypassing the strategy system.
 */

import type { PlanningContext } from "./planning-context";
import { buildPlanningContext } from "./planning-context";
import { SEEDS, type PlanningResult, type ServiceSeed, type EstimationStrategy, formatRange as formatRangeOriginal } from "./planning-range";
import { evaluateStrategy } from "./planning-strategies";
import { getAllServices } from "./registries";

export type ServiceSlug = string;

// Re-export formatRange for convenience
export { formatRangeOriginal as formatRange };

const HIGH_BIAS = 1.12; // conservative upward bias

/**
 * Estimate Engine — processes a PlanningContext and returns a PlanningResult.
 *
 * This is the authoritative estimate calculation. All estimate flows must
 * pass through this function.
 *
 * Routes to appropriate estimation authority based on projectType:
 * - "painting": Uses painting authority (prep, coatings, restoration, square footage)
 * - "building": Uses building authority (structural, framing, carpentry, materials)
 */
export function estimateEngine(context: PlanningContext): PlanningResult | null {
  const { services, answers, projectType } = context;

  if (!services.length) return null;

  // Route to appropriate estimation authority
  if (projectType === "painting") {
    return estimatePaintingAuthority(context);
  }

  // Default to building authority for "building" or undefined
  return estimateBuildingAuthority(context);
}

/**
 * Building Authority — structural scope, framing, remodel knowledge,
 * permits, carpentry, labor, materials.
 */
function estimateBuildingAuthority(context: PlanningContext): PlanningResult | null {
  const { services, answers } = context;

  let low = 0;
  let high = 0;
  const labels: string[] = [];
  const breakdown: PlanningResult["breakdown"] = [];
  const assumptions: string[] = [];
  const missingInputs: string[] = [];

  for (const service of services) {
    const seed = SEEDS[service];
    if (!seed) {
      missingInputs.push(`Unknown service: ${service}`);
      continue;
    }

    // Evaluate using the strategy system
    const result = evaluateStrategy(seed, answers, service);

    low += result.low;
    high += result.high;
    labels.push(seed.label);

    // Build breakdown entry
    breakdown.push({
      service,
      label: seed.label,
      low: result.low,
      high: result.high,
      strategy: seed.strategy ?? "flat",
      scopeUsed: result.scopeUsed,
      measurementUsed: result.measurementUsed,
    });

    // Collect reasoning as assumptions
    assumptions.push(...result.reasoning);

    // Track missing inputs
    if (result.measurementUsed === undefined && seed.strategy === "per-unit") {
      missingInputs.push(`Missing measurement for ${service}`);
    }
  }

  if (!labels.length) return null;

  // Apply conservative bias
  high = Math.round((high * HIGH_BIAS) / 100) * 100;
  low = Math.round(low / 100) * 100;

  // Compute overall confidence
  const confidence = computeOverallConfidence(breakdown);

  return {
    labels,
    low,
    high,
    note:
      "This is not an official quote. It is a conservative planning estimate based on similar Oregon projects, current material pricing, travel, permitting, and typical labor. Taylor will prepare your official estimate after reviewing your specific property.",
    breakdown,
    confidence,
    assumptions: assumptions.length > 0 ? assumptions : ["Based on typical project ranges for selected services"],
    missingInputs,
  };
}

/**
 * Painting Authority — preparation, coatings, restoration, square footage,
 * access difficulty, finish systems, paint quality, stain systems, prep labor.
 *
 * This authority does NOT use construction pricing (decks, kitchens, remodels).
 * It estimates based on surface area, prep complexity, and coating systems.
 *
 * Reads painting type from Service Authority capabilities, not hard-coded service names.
 */
function estimatePaintingAuthority(context: PlanningContext): PlanningResult | null {
  const { services, answers } = context;

  // For painting projects, we need square footage to estimate accurately
  // If not provided, we'll use conservative defaults but flag as low confidence
  const sqFt = (answers["square_footage"] as number) || 0;
  const prepComplexity = (answers["prep_complexity"] as string) || "standard";
  const coats = (answers["coats"] as number) || 2;

  let low = 0;
  let high = 0;
  const labels: string[] = [];
  const breakdown: PlanningResult["breakdown"] = [];
  const assumptions: string[] = [];
  const missingInputs: string[] = [];

  // Base painting rates per square foot (Oregon market, 2024)
  // These are conservative planning ranges, not quotes
  const baseRates = {
    interior: { low: 3.5, high: 5.5 }, // per sq ft
    exterior: { low: 4.5, high: 7.0 }, // per sq ft
    deck_stain: { low: 3.0, high: 5.0 }, // per sq ft
    fence_stain: { low: 2.5, high: 4.5 }, // per sq ft
    cabinet_paint: { low: 8.0, high: 12.0 }, // per linear ft of cabinet run
  };

  // Prep complexity multipliers
  const prepMultipliers = {
    minimal: 1.0,
    standard: 1.3,
    extensive: 1.8,
  };

  const prepMult = prepMultipliers[prepComplexity as keyof typeof prepMultipliers] || 1.3;
  const coatsMult = coats / 2; // Normalize to 2 coats baseline

  // Determine painting type from Service Authority capabilities
  // No hard-coded service checks - reads from authority
  const allServices = getAllServices();
  let paintingType: "interior" | "exterior" | "deck_stain" | "fence_stain" | "cabinet_paint" = "interior";

  // Look up painting type from service capabilities
  for (const serviceSlug of services) {
    const service = allServices.find(s => s.slug === serviceSlug);
    if (service?.capabilities?.paintableSurface && service.capabilities.paintingType) {
      paintingType = service.capabilities.paintingType as any;
      break;
    }
  }

  // Fallback to location if no painting type found
  if (paintingType === "interior" && answers["location"] === "exterior") {
    paintingType = "exterior";
  }

  const rates = baseRates[paintingType];
  const adjustedLow = rates.low * prepMult * coatsMult;
  const adjustedHigh = rates.high * prepMult * coatsMult;

  if (sqFt > 0) {
    low = Math.round(sqFt * adjustedLow);
    high = Math.round(sqFt * adjustedHigh);
    labels.push(`${paintingType.charAt(0).toUpperCase() + paintingType.slice(1)} painting/staining`);
  } else {
    // No square footage provided - use conservative defaults but flag as low confidence
    low = Math.round(2000 * adjustedLow);
    high = Math.round(4000 * adjustedHigh);
    labels.push(`${paintingType.charAt(0).toUpperCase() + paintingType.slice(1)} painting/staining (estimated)`);
    missingInputs.push("Square footage not provided - using conservative default range");
  }

  // Add breakdown entry
  breakdown.push({
    service: services[0] || "painting",
    label: labels[0],
    low,
    high,
    strategy: "per-unit",
    scopeUsed: paintingType,
    measurementUsed: sqFt ? { answerId: "square_footage", value: sqFt, unit: "sq ft" } : undefined,
  });

  // Build assumptions
  assumptions.push(
    `Based on ${paintingType} painting/staining work`,
    `Prep complexity: ${prepComplexity}`,
    `${coats} coat(s) estimated`,
    sqFt > 0 ? `${sqFt} sq ft surface area` : "Square footage estimated - will vary with actual measurement",
    "Includes standard prep labor, materials, and application",
    "Does not include extensive restoration or structural repairs"
  );

  if (sqFt === 0) {
    assumptions.push("Low confidence: actual square footage will significantly impact final price");
  }

  // Apply conservative bias
  high = Math.round((high * HIGH_BIAS) / 100) * 100;
  low = Math.round(low / 100) * 100;

  // Compute confidence
  const confidence = sqFt > 0 ? "medium" : "low";

  return {
    labels,
    low,
    high,
    note:
      "This is not an official quote. It is a conservative planning estimate for painting/staining work based on surface area, prep complexity, and coating systems. Taylor will prepare your official estimate after reviewing your specific property and measuring the actual surface area.",
    breakdown,
    confidence,
    assumptions,
    missingInputs,
  };
}

/**
 * Convenience function: EstimateRequest → PlanningResult.
 *
 * This is the primary entry point for the wizard.
 */
export function estimateFromRequest(request: import("@/types").EstimateRequest): PlanningResult | null {
  const context = buildPlanningContext(request);
  return estimateEngine(context);
}

/**
 * Compute overall confidence based on breakdown strategies.
 */
function computeOverallConfidence(breakdown: PlanningResult["breakdown"]): "low" | "medium" | "high" {
  if (!breakdown || breakdown.length === 0) return "medium";

  const strategiesUsed = breakdown.map((b) => b.strategy);
  const anyFlat = strategiesUsed.includes("flat");
  const anyPerUnit = strategiesUsed.includes("per-unit");

  // If per-unit is used but no measurement is provided, confidence is low
  const anyMissingMeasurement = breakdown.some(
    (b) => b.strategy === "per-unit" && !b.measurementUsed
  );

  if (anyMissingMeasurement) return "low";
  if (anyFlat) return "medium";
  return "high";
}
