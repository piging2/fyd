/**
 * Tag Suggester - Stage 6 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Moderation
 * 
 * This suggester automatically recommends tags for reviews.
 * Moderator simply clicks Accept. No manual typing.
 * 
 * Suggested tags:
 * - Pergola, Painting, Fence, Bathroom, Deck
 * - Trex, Cedar, Steel, Privacy, Repair, Custom
 */

export interface TagSuggestion {
  tag: string;
  confidence: number; // 0.00-1.00
  reason: string;
}

export interface TagSuggestionResult {
  suggestedTags: TagSuggestion[];
  allPossibleTags: string[];
}

// Tag definitions with keywords
const TAG_DEFINITIONS: Record<string, { keywords: string[]; confidence: number }> = {
  'Pergola': {
    keywords: ['pergola', 'pergolas', 'shade', 'cover', 'outdoor structure', 'patio cover'],
    confidence: 0.9,
  },
  'Painting': {
    keywords: ['paint', 'painting', 'stain', 'staining', 'refinish', 'refinishing', 'color', 'finish'],
    confidence: 0.85,
  },
  'Fence': {
    keywords: ['fence', 'fencing', 'fence installation', 'privacy fence', 'wood fence', 'vinyl fence'],
    confidence: 0.9,
  },
  'Bathroom': {
    keywords: ['bathroom', 'bath', 'vanity', 'toilet', 'shower', 'remodel', 'renovation'],
    confidence: 0.85,
  },
  'Deck': {
    keywords: ['deck', 'decking', 'deck installation', 'wood deck', 'composite deck', 'patio'],
    confidence: 0.9,
  },
  'Trex': {
    keywords: ['trex', 'composite', 'composite decking', 'synthetic'],
    confidence: 0.95,
  },
  'Cedar': {
    keywords: ['cedar', 'cedar wood', 'western red cedar', 'natural wood'],
    confidence: 0.9,
  },
  'Steel': {
    keywords: ['steel', 'metal', 'aluminum', 'metal frame', 'steel frame'],
    confidence: 0.85,
  },
  'Privacy': {
    keywords: ['privacy', 'private', 'screen', 'screening', 'secluded'],
    confidence: 0.8,
  },
  'Repair': {
    keywords: ['repair', 'repairs', 'fix', 'fixed', 'restore', 'restoration', 'maintenance'],
    confidence: 0.8,
  },
  'Custom': {
    keywords: ['custom', 'customized', 'bespoke', 'built-to-order', 'made to order'],
    confidence: 0.85,
  },
  'Outdoor Living': {
    keywords: ['outdoor living', 'outdoor space', 'backyard', 'outdoor area'],
    confidence: 0.8,
  },
  'Kitchen': {
    keywords: ['kitchen', 'cabinet', 'cabinets', 'countertop', 'countertops', 'island'],
    confidence: 0.85,
  },
  'Siding': {
    keywords: ['siding', 'exterior', 'cladding', 'wood siding', 'vinyl siding'],
    confidence: 0.85,
  },
  'Trim': {
    keywords: ['trim', 'molding', 'crown molding', 'baseboard', 'finish work'],
    confidence: 0.8,
  },
  'Built-ins': {
    keywords: ['built-in', 'builtins', 'custom built-in', 'shelving', 'storage'],
    confidence: 0.85,
  },
  'Carpentry': {
    keywords: ['carpentry', 'woodwork', 'woodworking', 'craftsmanship'],
    confidence: 0.8,
  },
};

/**
 * Suggest tags based on review text
 */
export function suggestTags(text: string): TagSuggestionResult {
  const lowerText = text.toLowerCase();
  const suggestedTags: TagSuggestion[] = [];

  for (const [tag, definition] of Object.entries(TAG_DEFINITIONS)) {
    const matchedKeywords = definition.keywords.filter(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      // Boost confidence based on number of keyword matches
      const matchCount = matchedKeywords.length;
      const boostedConfidence = Math.min(1.0, definition.confidence + (matchCount * 0.05));

      suggestedTags.push({
        tag,
        confidence: boostedConfidence,
        reason: `Matches keywords: ${matchedKeywords.join(', ')}`,
      });
    }
  }

  // Sort by confidence (highest first)
  suggestedTags.sort((a, b) => b.confidence - a.confidence);

  // Return all possible tags for reference
  const allPossibleTags = Object.keys(TAG_DEFINITIONS);

  return {
    suggestedTags,
    allPossibleTags,
  };
}

/**
 * Quick tag suggestion (returns only tag names)
 * Use when you don't need confidence scores
 */
export function quickSuggestTags(text: string): string[] {
  const result = suggestTags(text);
  return result.suggestedTags.map(s => s.tag);
}

/**
 * Get all available tags
 */
export function getAllTags(): string[] {
  return Object.keys(TAG_DEFINITIONS);
}
