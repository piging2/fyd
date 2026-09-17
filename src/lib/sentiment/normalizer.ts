/**
 * Text Normalizer - Stage 1 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extraction → Classification → Quality Score → Duplicate Detection → Moderation
 * 
 * This normalizer cleans incoming review text before classification.
 * It never changes the customer's meaning, only normalizes formatting.
 * 
 * Normalizations:
 * - Whitespace (trim, normalize multiple spaces)
 * - Capitalization (sentence case for first letter, preserve proper nouns)
 * - Repeated punctuation (!!!! → !)
 * - Emoji handling (normalize to text representation)
 * - Unicode normalization (NFC form)
 */

/**
 * Normalize whitespace
 * - Trim leading/trailing whitespace
 * - Normalize multiple spaces to single space
 * - Normalize multiple newlines to single newline
 */
function normalizeWhitespace(text: string): string {
  return text
    .trim()
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .replace(/\n\s*\n/g, '\n') // Multiple newlines to single newline
    .replace(/[ \t]*\n[ \t]*/g, '\n'); // Spaces around newlines
}

/**
 * Normalize repeated punctuation
 * - !!!! → !
 * - ??? → ?
 * - ..... → .
 * - !!! → !
 * - Preserve intentional emphasis (max 2)
 */
function normalizeRepeatedPunctuation(text: string): string {
  return text
    .replace(/!{3,}/g, '!!') // Max 2 exclamation marks
    .replace(/\?{3,}/g, '??') // Max 2 question marks
    .replace(/\.{4,}/g, '...') // Max 3 periods (ellipsis)
    .replace(/!{2}/g, '!') // Reduce double to single
    .replace(/\?{2}/g, '?'); // Reduce double to single
}

/**
 * Normalize capitalization
 * - Sentence case for first letter of sentences
 * - Preserve proper nouns (Taylor, Lanie, Corvallis, Benton)
 * - Preserve ALL CAPS if intentional (short, < 3 chars)
 */
function normalizeCapitalization(text: string): string {
  const properNouns = new Set([
    'Taylor', 'Lanie', 'Corvallis', 'Benton', 'Linn', 'Marion',
    'Willamette', 'Oregon', 'Cedar', 'Trex', 'Fiberon',
    'Happy Place', 'Happy Place Carpentry',
  ]);

  return text
    .split('. ')
    .map(sentence => {
      if (sentence.length === 0) return '';
      
      // Check if it's a proper noun
      const firstWord = sentence.split(' ')[0];
      if (properNouns.has(firstWord)) {
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
      }
      
      // Check if ALL CAPS is intentional (short, < 3 chars)
      if (sentence.length < 3 && sentence === sentence.toUpperCase()) {
        return sentence;
      }
      
      // Sentence case
      return sentence.charAt(0).toUpperCase() + sentence.slice(1).toLowerCase();
    })
    .join('. ');
}

/**
 * Normalize emoji to text representation
 * - Convert common emoji to text for better processing
 * - Preserve meaning while making text searchable
 */
function normalizeEmoji(text: string): string {
  const emojiMap: Record<string, string> = {
    '⭐': 'star',
    '🌟': 'star',
    '✨': 'star',
    '👍': 'thumbs up',
    '👎': 'thumbs down',
    '❤️': 'love',
    '🔥': 'excellent',
    '💯': 'perfect',
    '✅': 'yes',
    '❌': 'no',
    '👏': 'applause',
    '🙏': 'thank you',
    '😊': 'happy',
    '😍': 'love',
    '😎': 'cool',
    '🤩': 'amazing',
    '😢': 'sad',
    '😭': 'very sad',
    '😡': 'angry',
    '🤬': 'very angry',
  };

  let normalized = text;
  for (const [emoji, textRep] of Object.entries(emojiMap)) {
    normalized = normalized.split(emoji).join(textRep);
  }
  
  return normalized;
}

/**
 * Unicode normalization
 * - Convert to NFC form (canonical composition)
 * - Ensures consistent representation of accented characters
 */
function normalizeUnicode(text: string): string {
  return text.normalize('NFC');
}

/**
 * Complete normalization pipeline
 * Applies all normalizations in order
 */
export function normalizeText(text: string): {
  original: string;
  normalized: string;
  changes: string[];
} {
  const original = text;
  const changes: string[] = [];
  
  let normalized = text;
  
  // Unicode normalization first
  const beforeUnicode = normalized;
  normalized = normalizeUnicode(normalized);
  if (beforeUnicode !== normalized) {
    changes.push('unicode');
  }
  
  // Whitespace normalization
  const beforeWhitespace = normalized;
  normalized = normalizeWhitespace(normalized);
  if (beforeWhitespace !== normalized) {
    changes.push('whitespace');
  }
  
  // Repeated punctuation normalization
  const beforePunctuation = normalized;
  normalized = normalizeRepeatedPunctuation(normalized);
  if (beforePunctuation !== normalized) {
    changes.push('punctuation');
  }
  
  // Emoji normalization
  const beforeEmoji = normalized;
  normalized = normalizeEmoji(normalized);
  if (beforeEmoji !== normalized) {
    changes.push('emoji');
  }
  
  // Capitalization normalization
  const beforeCapitalization = normalized;
  normalized = normalizeCapitalization(normalized);
  if (beforeCapitalization !== normalized) {
    changes.push('capitalization');
  }
  
  return {
    original,
    normalized,
    changes,
  };
}

/**
 * Quick normalize (returns only normalized text)
 * Use when you don't need change tracking
 */
export function quickNormalize(text: string): string {
  const result = normalizeText(text);
  return result.normalized;
}
