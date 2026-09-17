/**
 * Interview Engine V3 — Signal-based architecture
 * 
 * This replaces the v2 form-based approach with a system that produces:
 * - Signals (flags) for operational routing
 * - Scores (confidence, complexity) for quality gating
 * - A canonical Project Intake Record for downstream consumers
 */

import type {
  EstimateQuestion,
  EstimatorFlag,
  ProjectIntakeRecord,
  QuestionDefinition,
  QuestionEdge,
  EstimateRequest
} from "@/types";

// ============================================================================
// PART 1.2: Estimator Flags
// ============================================================================

const FLAG_DEFINITIONS: Record<string, EstimatorFlag> = {
  possible_post_replacement: {
    id: "possible_post_replacement",
    label: "Possible post replacement needed",
    severity: "review"
  },
  possible_footing_issue: {
    id: "possible_footing_issue",
    label: "Possible footing issue",
    severity: "review"
  },
  structural_review: {
    id: "structural_review",
    label: "Structural review required",
    severity: "site_visit_required"
  },
  possible_subfloor: {
    id: "possible_subfloor",
    label: "Possible subfloor damage",
    severity: "review"
  },
  hybrid_repair_and_refinish: {
    id: "hybrid_repair_and_refinish",
    label: "Hybrid repair and refinish needed",
    severity: "review"
  },
  moisture_source_unaddressed: {
    id: "moisture_source_unaddressed",
    label: "Moisture source may be unaddressed",
    severity: "review"
  },
  code_review_required: {
    id: "code_review_required",
    label: "Code review required",
    severity: "review"
  },
  material_unconfirmed: {
    id: "material_unconfirmed",
    label: "Material not confirmed",
    severity: "review"
  }
};

// ============================================================================
// PART 1.3: Confidence Score
// ============================================================================

export function computeConfidence(answers: Record<string, string | number | boolean>): number {
  const notSureCount = Object.values(answers).filter(
    v => v === "Not sure" || v === "Unsure"
  ).length;
  const totalAnswered = Object.keys(answers).length;
  
  if (totalAnswered === 0) return 100;
  
  const base = 100 - (notSureCount / totalAnswered) * 60;
  return Math.round(base);
}

// ============================================================================
// PART 1.4: "Not sure" handling
// ============================================================================

export function normalizeAnswer(value: string | number | boolean): string | number | boolean | null {
  if (value === "Not sure" || value === "Unsure") {
    return null; // Missing data for pricing/measurement
  }
  return value;
}

// ============================================================================
// PART 1.11: Complexity Score
// ============================================================================

export function computeComplexity(
  flags: EstimatorFlag[],
  answers: Record<string, string | number | boolean>
): number {
  let complexity = 0;
  
  // Flag-based weights
  for (const flag of flags) {
    if (flag.id === "structural_review") complexity += 4;
    if (flag.id === "code_review_required") complexity += 2;
    if (flag.id === "hybrid_repair_and_refinish") complexity += 2;
  }
  
  // Answer-based weights
  for (const [key, value] of Object.entries(answers)) {
    if (value === "Not sure" || value === "Unsure") {
      complexity += 2;
    }
    if (typeof value === "string" && value.toLowerCase().includes("composite")) {
      complexity += 1;
    }
  }
  
  return complexity;
}

// ============================================================================
// PART 1.7: Project Intake Record Assembler
// ============================================================================

export function buildProjectIntakeRecord(
  request: EstimateRequest,
  questions: EstimateQuestion[]
): ProjectIntakeRecord {
  const service = request.services[0] || "unknown";
  const answers = request.answers;
  
  // Extract intent
  const intent = request.projectIntent || answers["intent"]?.toString() || "unknown";
  
  // Extract measurements (scope questions with numeric values)
  const measurements: Record<string, number> = {};
  const condition: Record<string, string | boolean> = {};
  const materials: Record<string, string> = {};
  const flags: EstimatorFlag[] = [];
  
  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === undefined || answer === null) continue;
    
    // Categorize answer based on question category
    if (question.category === "scope" && typeof answer === "number") {
      const key = question.measurementType || "value";
      measurements[key] = answer;
    } else if (question.category === "condition") {
      condition[question.id] = answer as string | boolean;
    } else if (question.category === "material") {
      materials[question.id] = answer as string;
    }
    
    // Emit flags based on answer
    if (question.flags && typeof answer === "string") {
      const flagConfig = question.flags[answer];
      if (flagConfig) {
        const flagDef = FLAG_DEFINITIONS[flagConfig.flagId];
        if (flagDef) {
          flags.push(flagDef);
        }
      }
    }
  }
  
  // Compute scores
  const confidence = computeConfidence(answers);
  const complexity = computeComplexity(flags, answers);
  
  return {
    service,
    intent,
    measurements,
    condition,
    materials,
    flags,
    complexity,
    confidence
  };
}

// ============================================================================
// PART 1.8: Interview Summary Generator
// ============================================================================

export function generateInterviewSummary(record: ProjectIntakeRecord): string[] {
  const lines: string[] = [];
  
  lines.push("You're looking for:");
  lines.push(`✓ ${record.intent}`);
  
  // Add materials if present
  if (Object.keys(record.materials).length > 0) {
    for (const [key, value] of Object.entries(record.materials)) {
      lines.push(`✓ ${value}`);
    }
  }
  
  // Add measurements if present
  if (Object.keys(record.measurements).length > 0) {
    for (const [key, value] of Object.entries(record.measurements)) {
      lines.push(`✓ About ${value} ${key}`);
    }
  }
  
  // Add condition if present
  if (Object.keys(record.condition).length > 0) {
    for (const [key, value] of Object.entries(record.condition)) {
      if (typeof value === "string") {
        lines.push(`✓ ${value}`);
      }
    }
  }
  
  // Add flags as warnings if present
  if (record.flags.length > 0) {
    for (const flag of record.flags) {
      if (flag.severity === "review" || flag.severity === "site_visit_required") {
        lines.push(`⚠ ${flag.label}`);
      }
    }
  }
  
  return lines;
}

// ============================================================================
// PART 1.9: Contextual Photo Prompts
// ============================================================================

export function getPhotoPrompt(service: string, intent: string, flags: EstimatorFlag[]): string {
  const hasStructuralFlag = flags.some(f => f.id === "structural_review");
  const hasMoistureFlag = flags.some(f => f.id === "moisture_source_unaddressed");
  const hasSubfloorFlag = flags.some(f => f.id === "possible_subfloor");
  
  // Fence-specific prompts
  if (service === "fences") {
    if (intent.includes("replace")) {
      return "A wide shot of the fence line, plus a close-up of any leaning sections or damaged posts.";
    }
  }
  
  // Deck-specific prompts
  if (service === "decks") {
    if (hasStructuralFlag) {
      return "A shot of where the deck meets the house, plus any visibly damaged boards or soft spots.";
    }
  }
  
  // Painting-specific prompts
  if (service === "painting") {
    if (hasMoistureFlag) {
      return "A close-up of the peeling or damaged area, plus one wide shot of the whole wall or elevation, plus anything nearby that might be a water source (gutter, downspout, roofline).";
    }
  }
  
  // Bathroom-specific prompts
  if (service === "bathrooms") {
    if (hasSubfloorFlag) {
      return "Any visible water stains, soft flooring, or discoloration, plus one wide shot of the room.";
    }
  }
  
  // Default prompt
  return "A wide shot of the project area, plus a close-up of any areas that need attention.";
}

// ============================================================================
// PART 1.10: Dynamic Scheduling Questions
// ============================================================================

export function getSchedulingQuestion(service: string, intent: string): { id: string; label: string; options: string[] } | null {
  // Fence/Deck construction questions
  if (service === "fences" || service === "decks") {
    if (intent.includes("new") || intent.includes("replace") || intent.includes("build")) {
      return {
        id: "yard_access",
        label: "Is the yard currently accessible for equipment and material delivery?",
        options: ["Yes", "No - narrow gate", "No - stairs/slope", "Not sure"]
      };
    }
  }
  
  // Bathroom question
  if (service === "bathrooms") {
    return {
      id: "only_bathroom",
      label: "Is this your only bathroom?",
      options: ["Yes", "No"]
    };
  }
  
  // Painting deadline question
  if (service === "painting") {
    return {
      id: "deadline",
      label: "Are you hoping to finish by a certain date?",
      options: ["Yes - specific date", "Yes - within a month", "No specific deadline", "Not sure"]
    };
  }
  
  // No additional question needed
  return null;
}

// ============================================================================
// PART 1.12: Shared Question Definitions
// ============================================================================

export const SHARED_DEFINITIONS: Record<string, QuestionDefinition> = {
  material_question: {
    id: "material_question",
    label: "What material are you thinking?",
    type: "select",
    options: ["Cedar", "Pressure treated", "Vinyl", "Metal", "Composite", "Not sure"],
    category: "material",
    flags: {
      "Composite": { flagId: "material_unconfirmed", severity: "review" }
    }
  }
};

// ============================================================================
// Routing Thresholds
// ============================================================================

export const ROUTING_THRESHOLDS = {
  CONFIDENCE_SITE_VISIT: 70, // Below this, require site visit
  COMPLEXITY_REVIEW: 8 // At or above this, require estimator review
};

export function shouldRequireSiteVisit(record: ProjectIntakeRecord): boolean {
  // Route to site visit if confidence is low
  if (record.confidence < ROUTING_THRESHOLDS.CONFIDENCE_SITE_VISIT) {
    return true;
  }
  
  // Route to site visit if any flag requires it
  if (record.flags.some(f => f.severity === "site_visit_required")) {
    return true;
  }
  
  return false;
}

export function shouldRequireEstimatorReview(record: ProjectIntakeRecord): boolean {
  // Route to estimator review if complexity is high
  if (record.complexity >= ROUTING_THRESHOLDS.COMPLEXITY_REVIEW) {
    return true;
  }
  
  // Route to estimator review if any flag requires review
  if (record.flags.some(f => f.severity === "review")) {
    return true;
  }
  
  return false;
}
