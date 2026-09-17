/**
 * Project Suggester - Stage 8 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Service Suggestion → Project Suggestion → Moderation
 * 
 * This suggester automatically recommends the project match based on keywords.
 * If the review says "Love our pergola" and only one pergola project exists, it suggests that project.
 * Moderator clicks Accept. No searching.
 */

export interface ProjectSuggestion {
  projectId: string;
  projectTitle: string;
  confidence: number; // 0.00-1.00
  reason: string;
}

export interface ProjectSuggestionResult {
  suggestedProject?: ProjectSuggestion;
  allProjects: { id: string; title: string; service: string }[];
}

// Mock project data (in production, this would come from Project Authority)
const MOCK_PROJECTS: Array<{ id: string; title: string; service: string; keywords: string[] }> = [
  {
    id: 'deck-installation-willamette-valley',
    title: 'Deck Installation in Willamette Valley',
    service: 'decks',
    keywords: ['deck', 'decking', 'wood deck', 'composite', 'trex', 'cedar', 'patio', 'outdoor'],
  },
  {
    id: 'custom-pergola-corvallis',
    title: 'Custom Pergola in Corvallis',
    service: 'pergolas',
    keywords: ['pergola', 'pergolas', 'shade', 'cover', 'outdoor structure', 'patio cover', 'arbor'],
  },
  {
    id: 'custom-builtins-corvallis',
    title: 'Custom Built-ins in Corvallis',
    service: 'builtins',
    keywords: ['built-in', 'builtins', 'custom built-in', 'shelving', 'storage', 'bookshelf', 'cabinet'],
  },
  {
    id: 'fence-installation-benton-county',
    title: 'Fence Installation in Benton County',
    service: 'fences',
    keywords: ['fence', 'fencing', 'privacy fence', 'wood fence', 'vinyl fence', 'gate', 'boundary'],
  },
  {
    id: 'bathroom-remodel-albany',
    title: 'Bathroom Remodel in Albany',
    service: 'bathrooms',
    keywords: ['bathroom', 'bath', 'vanity', 'toilet', 'shower', 'tub', 'remodel', 'renovation'],
  },
  {
    id: 'kitchen-renovation-philomath',
    title: 'Kitchen Renovation in Philomath',
    service: 'kitchens',
    keywords: ['kitchen', 'cabinet', 'cabinets', 'countertop', 'countertops', 'island', 'remodel'],
  },
  {
    id: 'exterior-painting-corvallis',
    title: 'Exterior Painting in Corvallis',
    service: 'painting',
    keywords: ['paint', 'painting', 'stain', 'staining', 'refinish', 'color', 'finish', 'exterior'],
  },
  {
    id: 'siding-replacement-lebanon',
    title: 'Siding Replacement in Lebanon',
    service: 'siding',
    keywords: ['siding', 'exterior', 'cladding', 'wood siding', 'vinyl siding', 'fiber cement'],
  },
];

/**
 * Calculate keyword match score between text and project keywords
 */
function calculateKeywordMatch(text: string, projectKeywords: string[]): number {
  const lowerText = text.toLowerCase();
  const matchedKeywords = projectKeywords.filter(keyword =>
    lowerText.includes(keyword.toLowerCase())
  );

  if (matchedKeywords.length === 0) return 0;

  // Score based on number of matches and keyword specificity
  const matchCount = matchedKeywords.length;
  const specificityScore = matchedKeywords.reduce((score, keyword) => {
    // Longer keywords are more specific
    return score + (keyword.length * 0.1);
  }, 0);

  return Math.min(1.0, (matchCount * 0.3) + specificityScore);
}

/**
 * Suggest project based on review text
 */
export function suggestProject(text: string, serviceSlug?: string): ProjectSuggestionResult {
  const lowerText = text.toLowerCase();
  const suggestions: ProjectSuggestion[] = [];

  // Filter projects by service if provided
  const projectsToCheck = serviceSlug
    ? MOCK_PROJECTS.filter(p => p.service === serviceSlug)
    : MOCK_PROJECTS;

  for (const project of projectsToCheck) {
    const matchScore = calculateKeywordMatch(text, project.keywords);

    if (matchScore > 0) {
      // Boost confidence if service matches
      const serviceBoost = serviceSlug && project.service === serviceSlug ? 0.1 : 0;
      const confidence = Math.min(1.0, matchScore + serviceBoost);

      suggestions.push({
        projectId: project.id,
        projectTitle: project.title,
        confidence,
        reason: `Matches ${project.keywords.filter(k => lowerText.includes(k.toLowerCase())).join(', ')}`,
      });
    }
  }

  // Sort by confidence (highest first)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Return top suggestion if confidence >= 0.7
  const suggestedProject = suggestions.length > 0 && suggestions[0].confidence >= 0.7
    ? suggestions[0]
    : undefined;

  // Return all projects for reference
  const allProjects = MOCK_PROJECTS.map(p => ({
    id: p.id,
    title: p.title,
    service: p.service,
  }));

  return {
    suggestedProject,
    allProjects,
  };
}

/**
 * Quick project suggestion (returns only project ID)
 * Use when you don't need confidence scores
 */
export function quickSuggestProject(text: string, serviceSlug?: string): string | undefined {
  const result = suggestProject(text, serviceSlug);
  return result.suggestedProject?.projectId;
}

/**
 * Get all available projects
 */
export function getAllProjects(): { id: string; title: string; service: string }[] {
  return MOCK_PROJECTS.map(p => ({
    id: p.id,
    title: p.title,
    service: p.service,
  }));
}

/**
 * In production, replace MOCK_PROJECTS with actual Project Authority integration
 * Example:
 * 
 * import { getAllProjects as fetchProjects } from '@/lib/projects';
 * 
 * async function suggestProject(text: string, serviceSlug?: string): ProjectSuggestionResult {
 *   const projects = await fetchProjects();
 *   // ... rest of the logic
 * }
 */
