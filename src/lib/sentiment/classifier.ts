/**
 * Sentiment Classifier - Two-Bucket Moderation Classification
 * 
 * Architecture: Review Submission → Sentiment Classifier → Bucket Assignment → Moderation Queue
 * 
 * This classifier uses VADER (Valence Aware Dictionary and sEntiment Reasoner)
 * for lightweight, rule-based sentiment analysis that runs locally without external APIs.
 * 
 * Buckets:
 * - positive: High confidence positive sentiment, no profanity, no spam, no abuse
 * - review: Everything else (negative, neutral, mixed, questions, complaints, sarcasm, low confidence)
 * 
 * The classifier NEVER publishes, rejects, edits, or responds to reviews.
 * It only recommends the bucket. The human always decides.
 */

// VADER sentiment lexicon (simplified subset for common words)
// Full VADER lexicon is ~7500 words, this is a representative subset
const VADER_LEXICON: Record<string, number> = {
  // Strong positive
  'excellent': 3.0, 'amazing': 3.0, 'fantastic': 3.0, 'outstanding': 3.0, 'superb': 3.0,
  'wonderful': 3.0, 'great': 2.0, 'awesome': 2.0, 'love': 2.0, 'perfect': 2.0,
  'best': 2.0, 'incredible': 2.0, 'brilliant': 2.0, 'exceptional': 2.0, 'magnificent': 2.0,
  'terrific': 2.0, 'delighted': 2.0, 'pleased': 1.5, 'happy': 1.5, 'satisfied': 1.5,
  'impressed': 1.5, 'recommend': 1.5, 'recommended': 1.5,
  'good': 1.0, 'nice': 1.0, 'helpful': 1.0, 'professional': 1.0, 'quality': 1.0,
  'beautiful': 1.5, 'gorgeous': 1.5, 'stunning': 1.5, 'clean': 1.0, 'neat': 1.0,
  'prompt': 1.0, 'quick': 1.0, 'fast': 1.0, 'efficient': 1.0, 'reliable': 1.0,
  'friendly': 1.0, 'courteous': 1.0, 'polite': 1.0, 'kind': 1.0, 'patient': 1.0,
  'talented': 1.5, 'skilled': 1.5, 'expert': 1.5, 'knowledgeable': 1.5, 'experienced': 1.5,
  'thank': 1.0, 'thanks': 1.0, 'appreciate': 1.0, 'grateful': 1.0, 'appreciated': 1.0,

  // Strong negative
  'terrible': -3.0, 'awful': -3.0, 'horrible': -3.0, 'disgusting': -3.0, 'worst': -3.0,
  'hate': -2.5, 'disappoint': -2.0, 'disappointed': -2.0, 'disappointing': -2.0, 'poor': -2.0,
  'bad': -1.5, 'unhappy': -2.0, 'unsatisfied': -2.0, 'dissatisfied': -2.0, 'frustrated': -2.0,
  'angry': -2.0, 'upset': -1.5, 'annoyed': -1.5, 'irritated': -1.5, 'annoying': -1.5,
  'rude': -2.0, 'unprofessional': -2.0, 'incompetent': -2.0, 'careless': -1.5, 'lazy': -1.5,
  'slow': -1.0, 'late': -1.0, 'expensive': -1.0, 'overpriced': -1.5, 'waste': -1.5,
  'avoid': -2.0, 'warning': -2.0, 'caution': -1.5, 'problem': -1.0,
  'issue': -1.0, 'problematic': -1.5, 'difficult': -1.0, 'hard': -0.5, 'failed': -2.0,
  'failure': -2.0, 'mistake': -1.0, 'error': -1.0, 'wrong': -1.0, 'broken': -1.5,
  'damaged': -1.5, 'messy': -1.0, 'dirty': -1.0, 'unresponsive': -2.0, 'ignored': -1.5,
  'neglect': -1.5, 'neglected': -1.5, 'unreliable': -1.5, 'untrustworthy': -2.0,

  // Neutral/negating words
  'not': -0.5, 'no': -0.5, 'none': -0.5, 'nothing': -0.5,
  'neither': -0.5, 'nor': -0.5, 'nobody': -0.5, 'nowhere': -0.5,
  'but': -0.5, 'however': -0.5, 'although': -0.5, 'despite': -0.5,
  'except': -0.5, 'unless': -0.5, 'without': -0.5,

  // Intensifiers
  'very': 0.5, 'extremely': 0.75, 'absolutely': 0.75, 'completely': 0.75,
  'totally': 0.75, 'utterly': 0.75, 'highly': 0.5, 'incredibly': 0.75, 'remarkably': 0.5,
  'exceptionally': 0.75, 'particularly': 0.5, 'especially': 0.5,

  // Diminishers
  'somewhat': -0.25, 'slightly': -0.25, 'kind of': -0.25, 'kinda': -0.25,
  'sort of': -0.25, 'sorta': -0.25, 'a bit': -0.25, 'a little': -0.25,
  'barely': -0.5, 'hardly': -0.5, 'scarcely': -0.5,
};

// Basic profanity list (expandable)
const PROFANITY_LIST = new Set([
  'damn', 'hell', 'shit', 'fuck', 'ass', 'bitch', 'bastard', 'crap',
  'suck', 'sucks', 'stupid', 'idiot', 'dumb', 'moron', 'retard',
  // Add more as needed
]);

// Spam patterns
const SPAM_PATTERNS = [
  /\b(click here)\b/gi,
  /\b(buy now)\b/gi,
  /\b(free money)\b/gi,
  /\b(win prize)\b/gi,
  /\b(urgent)\b/gi,
  /\b(act now)\b/gi,
  /\b(limited time)\b/gi,
  /(.)\1{4,}/g, // Repeated characters (e.g., "aaaaa")
  /\b\d{10,}\b/g, // Long numbers (phone numbers)
  /(http|https):\/\/[^\s]+/gi, // URLs
  /[A-Z]{5,}/g, // Excessive caps
];

// Question patterns (indicates needs review)
const QUESTION_PATTERNS = [
  /\?/g, // Any question mark
  /\b(can someone)\b/gi,
  /\b(can you)\b/gi,
  /\b(could you)\b/gi,
  /\b(would you)\b/gi,
  /\b(call me)\b/gi,
  /\b(contact)\b/gi,
  /\b(reach out)\b/gi,
];

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  bucket: 'positive' | 'review';
  confidence: number; // 0.00-1.00
  hasProfanity: boolean;
  hasSpam: boolean;
  hasQuestion: boolean;
  compoundScore: number; // VADER compound score
}

/**
 * Tokenize text into words (lowercase, remove punctuation)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Calculate VADER compound score
 * Compound score ranges from -1 (most negative) to +1 (most positive)
 */
function calculateVADERScore(text: string): number {
  const tokens = tokenize(text);
  let score = 0;
  let negationCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const lexiconScore = VADER_LEXICON[word];

    if (lexiconScore !== undefined) {
      // Check for negation in previous 3 words
      const previousTokens = tokens.slice(Math.max(0, i - 3), i);
      const hasNegation = previousTokens.some(t => 
        ['not', 'no', 'never', 'none', 'nothing', 'neither', 'nor', 'nobody', 'nowhere'].includes(t)
      );

      if (hasNegation) {
        score -= lexiconScore;
        negationCount++;
      } else {
        score += lexiconScore;
      }
    }

    // Check for intensifiers in previous 2 words
    const previousTokens = tokens.slice(Math.max(0, i - 2), i);
    const hasIntensifier = previousTokens.some(t =>
      ['very', 'really', 'extremely', 'absolutely', 'completely', 'totally', 'utterly'].includes(t)
    );

    if (hasIntensifier && lexiconScore !== undefined) {
      score += lexiconScore * 0.5; // Boost by 50%
    }

    // Check for diminishers in previous 2 words
    const hasDiminisher = previousTokens.some(t =>
      ['somewhat', 'slightly', 'kind of', 'kinda', 'sort of', 'sorta', 'a bit', 'a little'].includes(t)
    );

    if (hasDiminisher && lexiconScore !== undefined) {
      score -= lexiconScore * 0.25; // Reduce by 25%
    }
  }

  // Normalize compound score to [-1, 1]
  const maxScore = Math.max(Math.abs(score), 1);
  return score / maxScore;
}

/**
 * Check for profanity
 */
function hasProfanity(text: string): boolean {
  const tokens = tokenize(text);
  return tokens.some(word => PROFANITY_LIST.has(word));
}

/**
 * Check for spam patterns
 */
function hasSpam(text: string): boolean {
  return SPAM_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check for questions
 */
function hasQuestion(text: string): boolean {
  return QUESTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Calculate caps ratio (percentage of uppercase letters)
 */
function calculateCapsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  return uppercase / letters.length;
}

/**
 * Calculate text length score
 * Longer reviews are generally more thoughtful
 */
function calculateLengthScore(text: string): number {
  const length = text.length;
  if (length < 20) return 0.3; // Very short
  if (length < 50) return 0.5; // Short
  if (length < 100) return 0.7; // Medium
  if (length < 200) return 0.9; // Long
  return 1.0; // Very long
}

/**
 * Calculate enhanced confidence using multiple factors
 * - VADER compound score
 * - Rating (if provided)
 * - Profanity flag
 * - Question flag
 * - Caps ratio
 * - Spam flag
 * - Length score
 */
function calculateEnhancedConfidence(
  compoundScore: number,
  hasProfanity: boolean,
  hasQuestion: boolean,
  capsRatio: number,
  hasSpam: boolean,
  lengthScore: number,
  rating?: number
): number {
  let confidence = 0.5; // Base confidence

  // VADER score contribution (40%)
  const vaderContribution = Math.abs(compoundScore) * 0.4;
  confidence += vaderContribution;

  // Rating contribution (20%)
  if (rating) {
    const ratingScore = (rating - 3) / 2; // Map 1-5 to -1 to 1
    const ratingContribution = Math.abs(ratingScore) * 0.2;
    confidence += ratingContribution;
  }

  // Length contribution (15%)
  confidence += lengthScore * 0.15;

  // Negative factors
  if (hasProfanity) confidence -= 0.15;
  if (hasQuestion) confidence -= 0.1;
  if (hasSpam) confidence -= 0.2;
  if (capsRatio > 0.5) confidence -= 0.1; // More than 50% caps

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Calculate confidence based on compound score (legacy, kept for compatibility)
 */
function calculateConfidence(compoundScore: number): number {
  const absScore = Math.abs(compoundScore);
  // Map [-1, 1] to [0.5, 1.0]
  return 0.5 + (absScore * 0.5);
}

/**
 * Classify review sentiment and assign moderation bucket (enhanced)
 */
export function classifyReview(text: string, rating?: number): SentimentResult {
  const compoundScore = calculateVADERScore(text);
  const profanityFlag = hasProfanity(text);
  const spamFlag = hasSpam(text);
  const questionFlag = hasQuestion(text);
  const capsRatio = calculateCapsRatio(text);
  const lengthScore = calculateLengthScore(text);
  const confidence = calculateEnhancedConfidence(
    compoundScore,
    profanityFlag,
    questionFlag,
    capsRatio,
    spamFlag,
    lengthScore,
    rating
  );

  // Determine sentiment
  let sentiment: 'positive' | 'neutral' | 'negative';
  if (compoundScore >= 0.05) {
    sentiment = 'positive';
  } else if (compoundScore <= -0.05) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  // Determine bucket
  // Positive bucket: high confidence positive, no profanity, no spam, no abuse, no questions
  let bucket: 'positive' | 'review';
  const isHighConfidencePositive = sentiment === 'positive' && confidence >= 0.7;
  const isClean = !profanityFlag && !spamFlag && !questionFlag && capsRatio <= 0.5;
  const isHighRating = !rating || rating >= 4;

  if (isHighConfidencePositive && isClean && isHighRating) {
    bucket = 'positive';
  } else {
    bucket = 'review';
  }

  return {
    sentiment,
    bucket,
    confidence,
    hasProfanity: profanityFlag,
    hasSpam: spamFlag,
    hasQuestion: questionFlag,
    compoundScore,
  };
}

/**
 * Classify review with extensible classifier metadata (enhanced)
 * This allows future classifiers to plug into the same pipeline
 */
export function classifyReviewWithMetadata(
  text: string,
  rating?: number
): {
  sentiment: 'positive' | 'neutral' | 'negative';
  bucket: 'positive' | 'review';
  confidence: number;
  classifiers: {
    sentiment: {
      value: 'positive' | 'neutral' | 'negative';
      confidence: number;
      classifiedAt: string;
    };
    profanity: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    spam: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    question: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    caps_ratio: {
      value: number;
      confidence: number;
      classifiedAt: string;
    };
    length_score: {
      value: number;
      confidence: number;
      classifiedAt: string;
    };
  };
} {
  const result = classifyReview(text, rating);
  const capsRatio = calculateCapsRatio(text);
  const lengthScore = calculateLengthScore(text);
  const now = new Date().toISOString();

  return {
    sentiment: result.sentiment,
    bucket: result.bucket,
    confidence: result.confidence,
    classifiers: {
      sentiment: {
        value: result.sentiment,
        confidence: result.confidence,
        classifiedAt: now,
      },
      profanity: {
        value: result.hasProfanity,
        confidence: result.hasProfanity ? 0.9 : 0.95,
        classifiedAt: now,
      },
      spam: {
        value: result.hasSpam,
        confidence: result.hasSpam ? 0.8 : 0.9,
        classifiedAt: now,
      },
      question: {
        value: result.hasQuestion,
        confidence: result.hasQuestion ? 0.95 : 0.9,
        classifiedAt: now,
      },
      caps_ratio: {
        value: capsRatio,
        confidence: 1.0,
        classifiedAt: now,
      },
      length_score: {
        value: lengthScore,
        confidence: 1.0,
        classifiedAt: now,
      },
    },
  };
}
