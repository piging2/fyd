/**
 * County Suggester - Stage 9 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Service Suggestion → Project Suggestion → County Suggestion → Moderation
 * 
 * This suggester infers the county from review text if possible.
 * If uncertain, leave blank. Never guess.
 * 
 * Oregon counties served:
 * - Benton, Linn, Marion, Lane, Polk, Yamhill
 */

export interface CountySuggestion {
  county: string;
  confidence: number; // 0.00-1.00
  reason: string;
}

export interface CountySuggestionResult {
  suggestedCounty?: CountySuggestion;
  allCounties: string[];
}

// County definitions with keywords and cities
const COUNTY_DEFINITIONS: Record<string, { keywords: string[]; cities: string[]; confidence: number }> = {
  'Benton': {
    keywords: ['benton', 'benton county', 'corvallis', 'philomath', 'albany', 'monroe', 'adair', 'north albany'],
    cities: ['corvallis', 'philomath', 'albany', 'monroe', 'adair'],
    confidence: 0.9,
  },
  'Linn': {
    keywords: ['linn', 'linn county', 'albany', 'lebanon', 'sweet home', 'brownsville', 'scio', 'harrisburg', 'tangent'],
    cities: ['albany', 'lebanon', 'sweet home', 'brownsville', 'scio', 'harrisburg', 'tangent'],
    confidence: 0.9,
  },
  'Marion': {
    keywords: ['marion', 'marion county', 'salem', 'keizer', 'silverton', 'stayton', 'woodburn', 'canby', 'molalla'],
    cities: ['salem', 'keizer', 'silverton', 'stayton', 'woodburn', 'canby', 'molalla'],
    confidence: 0.9,
  },
  'Lane': {
    keywords: ['lane', 'lane county', 'eugene', 'springfield', 'cottage grove', 'junction city', 'florence', 'veneta'],
    cities: ['eugene', 'springfield', 'cottage grove', 'junction city', 'florence', 'veneta'],
    confidence: 0.9,
  },
  'Polk': {
    keywords: ['polk', 'polk county', 'dallas', 'independence', 'monmouth', 'salem', 'stayton', 'rickreall'],
    cities: ['dallas', 'independence', 'monmouth', 'salem', 'stayton', 'rickreall'],
    confidence: 0.85,
  },
  'Yamhill': {
    keywords: ['yamhill', 'yamhill county', 'mcminnville', 'newberg', 'dayton', 'sheridan', 'willamina', ' Carlton'],
    cities: ['mcminnville', 'newberg', 'dayton', 'sheridan', 'willamina', 'carlton'],
    confidence: 0.85,
  },
};

/**
 * Calculate county match score based on text
 */
function calculateCountyMatch(text: string, countyDef: typeof COUNTY_DEFINITIONS[keyof typeof COUNTY_DEFINITIONS]): number {
  const lowerText = text.toLowerCase();
  let score = 0;

  // Check for county name
  for (const keyword of countyDef.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score += 0.4;
    }
  }

  // Check for cities (higher weight)
  for (const city of countyDef.cities) {
    if (lowerText.includes(city.toLowerCase())) {
      score += 0.6;
    }
  }

  return Math.min(1.0, score);
}

/**
 * Suggest county based on review text
 * Only suggests if confidence >= 0.7 (high certainty)
 */
export function suggestCounty(text: string): CountySuggestionResult {
  const lowerText = text.toLowerCase();
  const suggestions: CountySuggestion[] = [];

  for (const [county, definition] of Object.entries(COUNTY_DEFINITIONS)) {
    const matchScore = calculateCountyMatch(text, definition);

    if (matchScore > 0) {
      const matchedKeywords = definition.keywords.filter(k => lowerText.includes(k.toLowerCase()));
      const matchedCities = definition.cities.filter(c => lowerText.includes(c.toLowerCase()));

      suggestions.push({
        county,
        confidence: matchScore,
        reason: matchedCities.length > 0
          ? `Matches cities: ${matchedCities.join(', ')}`
          : `Matches keywords: ${matchedKeywords.join(', ')}`,
      });
    }
  }

  // Sort by confidence (highest first)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Return top suggestion only if confidence >= 0.7 (high certainty)
  const suggestedCounty = suggestions.length > 0 && suggestions[0].confidence >= 0.7
    ? suggestions[0]
    : undefined;

  // Return all counties for reference
  const allCounties = Object.keys(COUNTY_DEFINITIONS);

  return {
    suggestedCounty,
    allCounties,
  };
}

/**
 * Quick county suggestion (returns only county name)
 * Use when you don't need confidence scores
 */
export function quickSuggestCounty(text: string): string | undefined {
  const result = suggestCounty(text);
  return result.suggestedCounty?.county;
}

/**
 * Get all available counties
 */
export function getAllCounties(): string[] {
  return Object.keys(COUNTY_DEFINITIONS);
}
