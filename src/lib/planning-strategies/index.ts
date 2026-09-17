/**
 * Planning Strategies — service-specific estimation logic.
 *
 * Each strategy is independently testable and handles one pricing model.
 * The engine orchestrates; strategies do not contain per-service branches.
 */

import type { ServiceSeed, EstimationStrategy } from "../planning-range";

export type ServiceSlug = string;

export interface StrategyResult {
  low: number;
  high: number;
  confidence: "low" | "medium" | "high";
  reasoning: string[];
  scopeUsed?: string;
  measurementUsed?: { answerId: string; value: number; unit: string };
}

export function evaluateStrategy(
  seed: ServiceSeed,
  answers: Record<string, unknown>,
  service: ServiceSlug
): StrategyResult {
  const strategy = seed.strategy ?? "flat";
  
  switch (strategy) {
    case "per-unit":
      return evaluatePerUnit(seed, answers, service);
    case "scope-based":
      return evaluateScopeBased(seed, answers, service);
    case "composite":
      return evaluateComposite(seed, answers, service);
    case "flat":
    default:
      return evaluateFlat(seed, service);
  }
}

/**
 * Flat strategy — use the base range directly.
 * This is the universal fallback when richer data is absent.
 */
function evaluateFlat(seed: ServiceSeed, service: ServiceSlug): StrategyResult {
  return {
    low: seed.range[0],
    high: seed.range[1],
    confidence: seed.baseConfidence ?? "medium",
    reasoning: [`Used typical project range for ${seed.label}`],
  };
}

/**
 * Per-unit strategy — multiply rate by a measurement answer.
 * Falls back to flat range if measurement is missing or non-numeric.
 * If scopeRanges exists and a scope answer is provided, uses scope-based pricing instead.
 */
function evaluatePerUnit(
  seed: ServiceSeed,
  answers: Record<string, unknown>,
  service: ServiceSlug
): StrategyResult {
  // Check scopeRanges first (for fences, decks, etc.)
  if (seed.scopeRanges) {
    const scopeAnswerId = getScopeAnswerId(service);
    const scopeValue = String(answers[scopeAnswerId] ?? "");
    const selectedRange = seed.scopeRanges[scopeValue];
    if (selectedRange) {
      return {
        low: selectedRange[0],
        high: selectedRange[1],
        confidence: seed.baseConfidence ?? "high",
        reasoning: [`Selected scope: ${scopeValue}`],
        scopeUsed: scopeValue,
      };
    }
  }

  // Find the measurement answer (e.g., fence_length, deck_size)
  const measurementAnswerId = getMeasurementAnswerId(service);
  const measurement = answers[measurementAnswerId];
  const numericValue = typeof measurement === "number" ? measurement : parseFloat(String(measurement ?? ""));
  
  if (!seed.unitRate || isNaN(numericValue) || numericValue <= 0) {
    return evaluateFlat(seed, service);
  }
  
  const [rateLow, rateHigh] = seed.unitRate;
  const low = rateLow * numericValue;
  const high = rateHigh * numericValue;
  
  const unitLabel = seed.unit?.label ?? "unit";
  
  return {
    low,
    high,
    confidence: seed.baseConfidence ?? "high",
    reasoning: [`Calculated from ${numericValue} ${unitLabel} × rate range`],
    measurementUsed: {
      answerId: measurementAnswerId,
      value: numericValue,
      unit: unitLabel,
    },
  };
}

/**
 * Scope-based strategy — select range based on scope answer.
 * Falls back to flat range if scope is missing or not in scopeRanges.
 */
function evaluateScopeBased(
  seed: ServiceSeed,
  answers: Record<string, unknown>,
  service: ServiceSlug
): StrategyResult {
  if (!seed.scopeRanges) {
    return evaluateFlat(seed, service);
  }
  
  const scopeAnswerId = getScopeAnswerId(service);
  const scopeValue = String(answers[scopeAnswerId] ?? "");
  
  const selectedRange = seed.scopeRanges[scopeValue];
  if (!selectedRange) {
    return evaluateFlat(seed, service);
  }
  
  return {
    low: selectedRange[0],
    high: selectedRange[1],
    confidence: seed.baseConfidence ?? "high",
    reasoning: [`Selected scope: ${scopeValue}`],
    scopeUsed: scopeValue,
  };
}

/**
 * Composite strategy — combination of multiple factors (future).
 * For now, falls back to flat.
 */
function evaluateComposite(
  seed: ServiceSeed,
  answers: Record<string, unknown>,
  service: ServiceSlug
): StrategyResult {
  return evaluateFlat(seed, service);
}

/**
 * Mapping from service slug to measurement answer ID.
 */
function getMeasurementAnswerId(service: ServiceSlug): string {
  const mapping: Record<ServiceSlug, string> = {
    fences: "fence_length",
    decks: "deck_size",
    pergolas: "pergola_size",
    "kitchen-remodel": "kitchen_appliances",
    "bath-remodel": "bath_count",
    "built-ins": "builtin_type",
    repairs: "repair_what",
  };
  return mapping[service] ?? "";
}

/**
 * Mapping from service slug to scope answer ID.
 */
function getScopeAnswerId(service: ServiceSlug): string {
  const mapping: Record<ServiceSlug, string> = {
    fences: "fence_scope",
    decks: "deck_scope",
    pergolas: "pergola_roof",
    "kitchen-remodel": "kitchen_scope",
    "bath-remodel": "bath_scope",
    "built-ins": "builtin_scope",
    repairs: "repair_what",
  };
  return mapping[service] ?? "";
}
