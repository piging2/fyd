/**
 * Planning Context — structured input for the planning engine.
 *
 * This module defines the shape of planning requests and provides a builder
 * function to construct PlanningContext from EstimateRequest.
 */

import type { EstimateRequest } from "@/types";

export type ServiceSlug = string;

export interface PlanningContext {
  services: ServiceSlug[];
  answers: Record<string, string | boolean | number>;
  property?: { city?: string; county?: string };
  projectType?: "painting" | "building"; // Determines estimation authority
  // Reserved for future enrichment — present in the type now so later phases
  // are additive, not breaking:
  materials?: Record<ServiceSlug, string>;
  regionalMultiplier?: number;
  historicalAdjustment?: number;
}

export function buildPlanningContext(req: EstimateRequest): PlanningContext {
  // Map projectIntent to projectType for engine compatibility
  // The engine expects "painting" | "building", but wizard uses human-readable strings
  let projectType: "painting" | "building" | undefined = req.projectType;
  
  if (!projectType && req.projectIntent) {
    // Derive projectType from projectIntent if not already set
    const intentLower = req.projectIntent.toLowerCase();
    if (intentLower.includes("paint") || intentLower.includes("stain") || intentLower.includes("refinish")) {
      projectType = "painting";
    } else {
      projectType = "building";
    }
  }
  
  return {
    services: req.services.filter((s): s is ServiceSlug => {
      // Filter to valid service slugs — this will be validated by the engine
      return typeof s === "string" && s.length > 0;
    }),
    answers: req.answers,
    property: { city: req.property.city, county: req.property.county },
    projectType,
  };
}
