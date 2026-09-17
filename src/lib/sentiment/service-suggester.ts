/**
 * Service Suggester - Stage 7 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Service Suggestion → Moderation
 * 
 * This suggester automatically recommends the service based on keywords.
 * Human confirms. No manual searching.
 * 
 * Suggested services:
 * - Painting, Bathroom, Pergolas, Repairs, Decks, Outdoor Living
 */

export interface ServiceSuggestion {
  serviceSlug: string;
  serviceName: string;
  confidence: number; // 0.00-1.00
  reason: string;
}

export interface ServiceSuggestionResult {
  suggestedService?: ServiceSuggestion;
  allServices: { slug: string; name: string }[];
}

// Service definitions with keywords
const SERVICE_DEFINITIONS: Record<string, { name: string; keywords: string[]; confidence: number }> = {
  'painting': {
    name: 'Painting',
    keywords: ['paint', 'painting', 'stain', 'staining', 'refinish', 'refinishing', 'color', 'finish', 'coat'],
    confidence: 0.9,
  },
  'bathrooms': {
    name: 'Bathrooms',
    keywords: ['bathroom', 'bath', 'vanity', 'toilet', 'shower', 'tub', 'remodel', 'renovation', 'plumbing'],
    confidence: 0.9,
  },
  'pergolas': {
    name: 'Pergolas',
    keywords: ['pergola', 'pergolas', 'shade', 'cover', 'outdoor structure', 'patio cover', 'arbor'],
    confidence: 0.95,
  },
  'repairs': {
    name: 'Repairs',
    keywords: ['repair', 'repairs', 'fix', 'fixed', 'restore', 'restoration', 'maintenance', 'patch'],
    confidence: 0.85,
  },
  'decks': {
    name: 'Decks',
    keywords: ['deck', 'decking', 'deck installation', 'wood deck', 'composite deck', 'patio', 'platform'],
    confidence: 0.95,
  },
  'outdoor-living': {
    name: 'Outdoor Living',
    keywords: ['outdoor living', 'outdoor space', 'backyard', 'outdoor area', 'exterior living'],
    confidence: 0.85,
  },
  'fences': {
    name: 'Fences',
    keywords: ['fence', 'fencing', 'fence installation', 'privacy fence', 'wood fence', 'vinyl fence', 'gate'],
    confidence: 0.9,
  },
  'kitchens': {
    name: 'Kitchens',
    keywords: ['kitchen', 'cabinet', 'cabinets', 'countertop', 'countertops', 'island', 'remodel'],
    confidence: 0.9,
  },
  'siding': {
    name: 'Siding',
    keywords: ['siding', 'exterior', 'cladding', 'wood siding', 'vinyl siding', 'fiber cement'],
    confidence: 0.85,
  },
  'trim': {
    name: 'Trim',
    keywords: ['trim', 'molding', 'crown molding', 'baseboard', 'finish work', 'casing'],
    confidence: 0.85,
  },
  'builtins': {
    name: 'Built-ins',
    keywords: ['built-in', 'builtins', 'custom built-in', 'shelving', 'storage', 'bookshelf'],
    confidence: 0.9,
  },
  'carpentry': {
    name: 'Carpentry',
    keywords: ['carpentry', 'woodwork', 'woodworking', 'craftsmanship', 'custom wood'],
    confidence: 0.8,
  },
};

/**
 * Suggest service based on review text
 */
export function suggestService(text: string): ServiceSuggestionResult {
  const lowerText = text.toLowerCase();
  const suggestions: ServiceSuggestion[] = [];

  for (const [slug, definition] of Object.entries(SERVICE_DEFINITIONS)) {
    const matchedKeywords = definition.keywords.filter(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      // Boost confidence based on number of keyword matches
      const matchCount = matchedKeywords.length;
      const boostedConfidence = Math.min(1.0, definition.confidence + (matchCount * 0.05));

      suggestions.push({
        serviceSlug: slug,
        serviceName: definition.name,
        confidence: boostedConfidence,
        reason: `Matches keywords: ${matchedKeywords.join(', ')}`,
      });
    }
  }

  // Sort by confidence (highest first)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Return top suggestion if confidence >= 0.7
  const suggestedService = suggestions.length > 0 && suggestions[0].confidence >= 0.7
    ? suggestions[0]
    : undefined;

  // Return all services for reference
  const allServices = Object.entries(SERVICE_DEFINITIONS).map(([slug, def]) => ({
    slug,
    name: def.name,
  }));

  return {
    suggestedService,
    allServices,
  };
}

/**
 * Quick service suggestion (returns only service slug)
 * Use when you don't need confidence scores
 */
export function quickSuggestService(text: string): string | undefined {
  const result = suggestService(text);
  return result.suggestedService?.serviceSlug;
}

/**
 * Get all available services
 */
export function getAllServices(): { slug: string; name: string }[] {
  return Object.entries(SERVICE_DEFINITIONS).map(([slug, def]) => ({
    slug,
    name: def.name,
  }));
}
