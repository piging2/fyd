/**
 * Interview Questions V3 — Full tree definitions from Part 2
 * 
 * This contains all question definitions with category tags, flags,
 * measurement types, and branching logic as specified in ESTIMATE_INTERVIEW_ENGINE_V3.md
 */

import type { EstimateQuestion } from "@/types";

// ============================================================================
// FENCE QUESTIONS
// ============================================================================

export const FENCE_QUESTIONS: EstimateQuestion[] = [
  // Root — fence_intent
  {
    id: "fence_intent",
    label: "What would you like done with your fence?",
    type: "select",
    options: ["Build new", "Replace existing", "Repair existing", "Refinish or stain"],
    category: "intent",
    required: true,
    next: {
      "Build new": "fence_new_length",
      "Replace existing": "fence_replace_reason",
      "Repair existing": "fence_repair_what",
      "Refinish or stain": "fence_finish_type"
    }
  },
  
  // Build New branch
  {
    id: "fence_new_length",
    label: "How long is the fence line (in feet)?",
    type: "number",
    category: "scope",
    measurementType: "length",
    measurementUnit: "feet",
    required: true,
    next: {
      "*": "fence_new_material"
    }
  },
  {
    id: "fence_new_material",
    label: "What material are you thinking?",
    type: "select",
    options: ["Cedar", "Pressure treated", "Vinyl", "Metal", "Composite", "Not sure"],
    category: "material",
    flags: {
      "Composite": { flagId: "material_unconfirmed", severity: "review" }
    },
    next: {
      "*": "fence_new_purpose"
    }
  },
  {
    id: "fence_new_purpose",
    label: "What's the main purpose of the fence?",
    type: "select",
    options: ["Privacy", "Marking the property line", "Containing pets or livestock", "Security", "Decorative"],
    category: "intent"
  },
  
  // Replace branch
  {
    id: "fence_replace_reason",
    label: "Why are you replacing the fence?",
    type: "select",
    options: ["Storm damage", "Rot", "Leaning or heaving", "Just old", "Different style"],
    category: "condition",
    flags: {
      "Rot": { flagId: "possible_post_replacement", severity: "review" },
      "Leaning or heaving": { flagId: "possible_footing_issue", severity: "review" }
    },
    next: {
      "*": "fence_replace_material"
    }
  },
  {
    id: "fence_replace_material",
    label: "What material would you like for the new fence?",
    type: "select",
    options: ["Cedar", "Pressure treated", "Vinyl", "Metal", "Composite", "Not sure"],
    category: "material",
    flags: {
      "Composite": { flagId: "material_unconfirmed", severity: "review" }
    },
    next: {
      "*": "fence_replace_length"
    }
  },
  {
    id: "fence_replace_length",
    label: "How long is the fence line (in feet)?",
    type: "number",
    category: "scope",
    measurementType: "length",
    measurementUnit: "feet",
    required: true,
    next: {
      "*": "fence_replace_removal"
    }
  },
  {
    id: "fence_replace_removal",
    label: "Does the existing fence need to be removed?",
    type: "select",
    options: ["Yes", "Already gone", "Not sure"],
    category: "scope"
  },
  
  // Repair branch
  {
    id: "fence_repair_what",
    label: "What needs repair?",
    type: "select",
    options: ["Broken or missing boards", "Leaning posts", "Gate not closing right", "Multiple issues"],
    category: "condition",
    next: {
      "*": "fence_repair_material"
    }
  },
  {
    id: "fence_repair_material",
    label: "What material is the existing fence?",
    type: "select",
    options: ["Cedar", "Pressure treated", "Vinyl", "Metal", "Not sure"],
    category: "material",
    next: {
      "*": "fence_repair_extent"
    }
  },
  {
    id: "fence_repair_extent",
    label: "How much of the fence needs repair?",
    type: "select",
    options: ["A single section", "A few sections", "Most of the fence"],
    category: "scope"
  },
  
  // Refinish / Stain branch
  {
    id: "fence_finish_type",
    label: "What type of finish are you considering?",
    type: "select",
    options: ["Transparent stain", "Semi-transparent stain", "Solid stain", "Paint", "Not sure"],
    category: "intent",
    next: {
      "*": "fence_finish_condition"
    }
  },
  {
    id: "fence_finish_condition",
    label: "What's the current condition of the fence?",
    type: "select",
    options: ["Just needs a fresh coat", "Peeling or faded", "Cracking or weathered", "Has damaged boards"],
    category: "condition",
    flags: {
      "Has damaged boards": { flagId: "hybrid_repair_and_refinish", severity: "review" }
    },
    next: {
      "*": "fence_finish_length"
    }
  },
  {
    id: "fence_finish_length",
    label: "How long is the fence line (in feet)?",
    type: "number",
    category: "scope",
    measurementType: "length",
    measurementUnit: "feet",
    required: true,
    next: {
      "*": "fence_finish_history"
    }
  },
  {
    id: "fence_finish_history",
    label: "What's currently on the fence?",
    type: "select",
    options: ["Stained", "Painted", "Bare wood", "Not sure"],
    category: "condition"
  }
];

// ============================================================================
// DECK QUESTIONS
// ============================================================================

export const DECK_QUESTIONS: EstimateQuestion[] = [
  // Root — deck_intent
  {
    id: "deck_intent",
    label: "What would you like done with your deck?",
    type: "select",
    options: ["New", "Replace", "Repair", "Refinish / stain"],
    category: "intent",
    required: true,
    next: {
      "New": "deck_new_size",
      "Replace": "deck_replace_reason",
      "Repair": "deck_repair_what",
      "Refinish / stain": "deck_finish_type"
    }
  },
  
  // New branch
  {
    id: "deck_new_size",
    label: "What's the approximate deck size (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true,
    next: {
      "*": "deck_new_material"
    }
  },
  {
    id: "deck_new_material",
    label: "What material are you thinking?",
    type: "select",
    options: ["Cedar", "Pressure treated", "Composite", "Not sure"],
    category: "material",
    flags: {
      "Composite": { flagId: "material_unconfirmed", severity: "review" }
    },
    next: {
      "*": "deck_new_elevation"
    }
  },
  {
    id: "deck_new_elevation",
    label: "What's the deck elevation?",
    type: "select",
    options: ["Ground level", "A few steps up", "Second story or higher"],
    category: "condition",
    flags: {
      "Second story or higher": { flagId: "code_review_required", severity: "review" }
    }
  },
  
  // Replace branch
  {
    id: "deck_replace_reason",
    label: "Why are you replacing the deck?",
    type: "select",
    options: ["Rot or ledger damage", "Failing structurally", "Old age", "Different layout or material"],
    category: "condition",
    flags: {
      "Rot or ledger damage": { flagId: "structural_review", severity: "site_visit_required" },
      "Failing structurally": { flagId: "structural_review", severity: "site_visit_required" }
    },
    next: {
      "*": "deck_replace_size"
    }
  },
  {
    id: "deck_replace_size",
    label: "What's the approximate deck size (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true,
    next: {
      "*": "deck_replace_demo"
    }
  },
  {
    id: "deck_replace_demo",
    label: "Does the existing deck need to be removed?",
    type: "select",
    options: ["Yes", "Already removed", "Not sure"],
    category: "scope"
  },
  
  // Repair branch
  {
    id: "deck_repair_what",
    label: "What needs repair?",
    type: "select",
    options: ["Loose or damaged boards", "Rot or soft spots near the house (ledger area)", "Railing or stairs", "Multiple issues"],
    category: "condition",
    flags: {
      "Rot or soft spots near the house (ledger area)": { flagId: "structural_review", severity: "site_visit_required" }
    },
    next: {
      "*": "deck_repair_size"
    }
  },
  {
    id: "deck_repair_size",
    label: "How much of the deck needs repair?",
    type: "select",
    options: ["A small area", "About half", "Most or all of it"],
    category: "scope"
  },
  
  // Refinish / Stain branch
  {
    id: "deck_finish_type",
    label: "What type of finish are you considering?",
    type: "select",
    options: ["Transparent stain", "Semi-transparent stain", "Solid stain or paint", "Not sure"],
    category: "intent",
    next: {
      "*": "deck_finish_condition"
    }
  },
  {
    id: "deck_finish_condition",
    label: "What's the current condition of the deck?",
    type: "select",
    options: ["Just needs a fresh coat", "Graying or faded", "Peeling previous finish", "Has damaged boards"],
    category: "condition",
    flags: {
      "Has damaged boards": { flagId: "hybrid_repair_and_refinish", severity: "review" }
    },
    next: {
      "*": "deck_finish_size"
    }
  },
  {
    id: "deck_finish_size",
    label: "What's the approximate deck size (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true
  }
];

// ============================================================================
// PAINTING QUESTIONS
// ============================================================================

export const PAINTING_QUESTIONS: EstimateQuestion[] = [
  // Root — painting_target
  {
    id: "painting_target",
    label: "What would you like painted?",
    type: "select",
    options: ["Exterior", "Interior", "Cabinets", "Deck", "Fence", "Other"],
    category: "intent",
    required: true,
    next: {
      "Exterior": "painting_ext_surface",
      "Interior": "painting_int_rooms",
      "Cabinets": "painting_cab_count",
      "Deck": "deck_finish_type", // Cross-service link to Deck-Refinish
      "Fence": "fence_finish_type", // Cross-service link to Fence-Refinish
      "Other": "painting_other_details"
    }
  },
  
  // Exterior branch
  {
    id: "painting_ext_surface",
    label: "What exterior surfaces need painting?",
    type: "select",
    options: ["Siding", "Trim", "Doors", "Garage", "Whole house"],
    category: "intent",
    next: {
      "*": "painting_ext_condition"
    }
  },
  {
    id: "painting_ext_condition",
    label: "What's the current condition?",
    type: "select",
    options: ["Ready for paint", "Peeling paint", "Bare wood", "Water damage", "Chalky surface"],
    category: "condition",
    flags: {
      "Water damage": { flagId: "moisture_source_unaddressed", severity: "review" }
    },
    next: {
      "*": "painting_ext_prep"
    }
  },
  {
    id: "painting_ext_prep",
    label: "How much prep work is needed?",
    type: "select",
    options: ["Just a light wash", "Scraping and sanding", "Wood repairs needed", "Not sure"],
    category: "scope"
  },
  
  // Interior branch
  {
    id: "painting_int_rooms",
    label: "How many rooms need painting?",
    type: "number",
    category: "scope",
    measurementType: "count",
    measurementUnit: "rooms",
    required: true,
    next: {
      "*": "painting_int_condition"
    }
  },
  {
    id: "painting_int_condition",
    label: "What's the current condition of the walls?",
    type: "select",
    options: ["Ready for paint", "Needs patching or repair", "Has smoke or water stains", "Not sure"],
    category: "condition",
    flags: {
      "Has smoke or water stains": { flagId: "moisture_source_unaddressed", severity: "review" }
    }
  },
  
  // Cabinets branch
  {
    id: "painting_cab_count",
    label: "How many cabinet doors/sections need painting?",
    type: "number",
    category: "scope",
    measurementType: "count",
    measurementUnit: "doors",
    required: true,
    next: {
      "*": "painting_cab_finish"
    }
  },
  {
    id: "painting_cab_finish",
    label: "What's the current cabinet finish?",
    type: "select",
    options: ["Painted", "Stained wood", "Laminate", "Not sure"],
    category: "condition"
  },
  
  // Other branch
  {
    id: "painting_other_details",
    label: "Please describe what needs painting:",
    type: "textarea",
    category: "intent"
  }
];

// ============================================================================
// BATHROOM QUESTIONS
// ============================================================================

export const BATHROOM_QUESTIONS: EstimateQuestion[] = [
  {
    id: "bath_scope",
    label: "What type of bathroom work do you need?",
    type: "select",
    options: ["Full remodel", "Shower/tub only", "Vanity + fixtures", "Tile + paint", "Not sure"],
    category: "intent",
    required: true,
    next: {
      "*": "bath_moisture"
    }
  },
  {
    id: "bath_moisture",
    label: "Are there any signs of water damage or moisture issues?",
    type: "select",
    options: ["Yes", "No", "Not sure"],
    category: "condition",
    flags: {
      "Yes": { flagId: "possible_subfloor", severity: "review" }
    }
  }
];

// ============================================================================
// FLOORING QUESTIONS
// ============================================================================

export const FLOORING_QUESTIONS: EstimateQuestion[] = [
  {
    id: "flooring_type",
    label: "What type of flooring do you need?",
    type: "select",
    options: ["Hardwood", "Laminate / LVP", "Tile", "Not sure"],
    category: "material",
    required: true,
    next: {
      "*": "flooring_size"
    }
  },
  {
    id: "flooring_size",
    label: "What's the approximate floor area (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true
  }
];

// ============================================================================
// POLE BARN QUESTIONS
// ============================================================================

export const POLEBARN_QUESTIONS: EstimateQuestion[] = [
  {
    id: "polebarn_use",
    label: "What will the pole barn be used for?",
    type: "select",
    options: ["Storage / equipment", "Livestock", "Workshop", "Vehicle storage", "Not sure"],
    category: "intent",
    required: true,
    next: {
      "*": "polebarn_size"
    }
  },
  {
    id: "polebarn_size",
    label: "What's the approximate size (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true,
    next: {
      "*": "polebarn_floor"
    }
  },
  {
    id: "polebarn_floor",
    label: "Will it have a concrete floor?",
    type: "select",
    options: ["Yes", "No", "Planning to add later"],
    category: "condition"
  }
];

// ============================================================================
// ADU QUESTIONS
// ============================================================================

export const ADU_QUESTIONS: EstimateQuestion[] = [
  {
    id: "adu_use",
    label: "What type of ADU work do you need?",
    type: "select",
    options: ["New construction", "Conversion (garage/basement)", "Addition to existing", "Not sure"],
    category: "intent",
    required: true,
    next: {
      "*": "adu_size"
    }
  },
  {
    id: "adu_size",
    label: "What's the approximate size (in square feet)?",
    type: "number",
    category: "scope",
    measurementType: "area",
    measurementUnit: "square_feet",
    required: true,
    next: {
      "*": "adu_utilities"
    }
  },
  {
    id: "adu_utilities",
    label: "Are utilities already connected?",
    type: "select",
    options: ["Yes", "No", "Unsure"],
    category: "condition"
  }
];

// ============================================================================
// HISTORIC RESTORATION QUESTIONS
// ============================================================================

export const HISTORIC_QUESTIONS: EstimateQuestion[] = [
  {
    id: "historic_focus",
    label: "What's the focus of the restoration?",
    type: "select",
    options: ["Structural", "Cosmetic", "Both", "Unsure"],
    category: "intent",
    required: true,
    next: {
      "*": "historic_age"
    }
  },
  {
    id: "historic_age",
    label: "Approximately how old is the home (in years)?",
    type: "number",
    category: "condition",
    required: true
  }
];

// ============================================================================
// FINISH CARPENTRY QUESTIONS
// ============================================================================

export const FINISH_CARPENTRY_QUESTIONS: EstimateQuestion[] = [
  {
    id: "finish_type",
    label: "What type of built-in or trim work do you need?",
    type: "select",
    options: ["Built-in shelving", "Trim & molding", "Crown molding", "Custom storage", "Not sure"],
    category: "intent",
    required: true,
    next: {
      "*": "finish_size"
    }
  },
  {
    id: "finish_size",
    label: "What's the scope of the work?",
    type: "select",
    options: ["Single piece", "A few pieces", "Whole room"],
    category: "scope"
  }
];

// ============================================================================
// SERVICE QUESTION MAP
// ============================================================================

export const SERVICE_QUESTIONS_MAP: Record<string, EstimateQuestion[]> = {
  fences: FENCE_QUESTIONS,
  decks: DECK_QUESTIONS,
  painting: PAINTING_QUESTIONS,
  bathrooms: BATHROOM_QUESTIONS,
  flooring: FLOORING_QUESTIONS,
  "pole-barns": POLEBARN_QUESTIONS,
  adus: ADU_QUESTIONS,
  "historic-restoration": HISTORIC_QUESTIONS,
  "finish-carpentry": FINISH_CARPENTRY_QUESTIONS
};

export function getQuestionsForService(serviceSlug: string): EstimateQuestion[] {
  return SERVICE_QUESTIONS_MAP[serviceSlug] || [];
}

/**
 * Find a question by ID across all service question maps
 * This enables cross-service question resolution (e.g., painting -> deck_finish_type)
 */
export function findQuestionById(questionId: string): EstimateQuestion | undefined {
  for (const questions of Object.values(SERVICE_QUESTIONS_MAP)) {
    const question = questions.find(q => q.id === questionId);
    if (question) return question;
  }
  return undefined;
}
