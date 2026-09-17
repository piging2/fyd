/**
 * Metadata Extractor - Stage 2 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Moderation
 * 
 * This extractor automatically derives useful metadata from review text.
 * All metadata becomes searchable and filterable for moderators.
 */

// Employee names (expandable)
const EMPLOYEE_NAMES = new Set([
  'taylor', 'lanie', 'happy place', 'happy place carpentry',
]);

// Service keywords (expandable)
const SERVICE_KEYWORDS = new Set([
  'pergola', 'deck', 'decking', 'fence', 'fencing', 'painting',
  'paint', 'stain', 'refinish', 'bathroom', 'bath', 'kitchen',
  'repair', 'repairs', 'custom', 'built-in', 'builtins', 'cabinetry',
  'outdoor', 'living', 'patio', 'cover', 'roof', 'siding',
  'trim', 'carpentry', 'woodwork', 'woodworking',
]);

// Material keywords (expandable)
const MATERIAL_KEYWORDS = new Set([
  'cedar', 'trex', 'fiberon', 'composite', 'pressure treated',
  'pt', 'pine', 'oak', 'mahogany', 'ipe', 'hardwood', 'softwood',
  'steel', 'metal', 'aluminum', 'vinyl', 'pvc', 'concrete',
  'stone', 'brick', 'stucco', 'drywall', 'insulation',
]);

// Location keywords (counties, cities)
const LOCATION_KEYWORDS = new Set([
  'corvallis', 'albany', 'philomath', 'lebanon', 'salem',
  'eugene', 'springfield', 'benton', 'linn', 'marion', 'lane',
  'polk', 'yamhill', 'willamette', 'valley', 'mid-willamette',
]);

// Contact request patterns
const CONTACT_PATTERNS = [
  /\b(call me)\b/gi,
  /\b(contact)\b/gi,
  /\b(reach out)\b/gi,
  /\b(get in touch)\b/gi,
  /\b(can you call)\b/gi,
  /\b(please call)\b/gi,
];

// Phone patterns
const PHONE_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // 123-456-7890 or 123.456.7890 or 1234567890
  /\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g, // (123) 456-7890
];

// Email patterns
const EMAIL_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
];

// URL patterns
const URL_PATTERNS = [
  /(http|https):\/\/[^\s]+/gi,
  /www\.[^\s]+/gi,
];

// Question patterns
const QUESTION_PATTERNS = [
  /\?/g,
  /\b(can someone)\b/gi,
  /\b(can you)\b/gi,
  /\b(could you)\b/gi,
  /\b(would you)\b/gi,
  /\b(how do i)\b/gi,
  /\b(what is)\b/gi,
  /\b(when will)\b/gi,
  /\b(where is)\b/gi,
  /\b(why did)\b/gi,
];

export interface ReviewMetadata {
  mentions_project: boolean;
  mentions_service: boolean;
  mentions_employee: boolean;
  mentions_material: boolean;
  mentions_location: boolean;
  estimated_length: number; // character count
  contains_question: boolean;
  contains_contact_request: boolean;
  contains_phone: boolean;
  contains_email: boolean;
  contains_url: boolean;
  contains_profanity: boolean;
  contains_spam_patterns: boolean;
  detected_services: string[];
  detected_materials: string[];
  detected_employees: string[];
  detected_locations: string[];
}

/**
 * Check if text mentions an employee
 */
function detectEmployeeMention(text: string): boolean {
  const lower = text.toLowerCase();
  return Array.from(EMPLOYEE_NAMES).some(name => lower.includes(name));
}

/**
 * Detect which employees are mentioned
 */
function detectEmployees(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  
  for (const name of EMPLOYEE_NAMES) {
    if (lower.includes(name)) {
      detected.push(name);
    }
  }
  
  return detected;
}

/**
 * Check if text mentions a service
 */
function detectServiceMention(text: string): boolean {
  const lower = text.toLowerCase();
  return Array.from(SERVICE_KEYWORDS).some(keyword => lower.includes(keyword));
}

/**
 * Detect which services are mentioned
 */
function detectServices(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  
  for (const keyword of SERVICE_KEYWORDS) {
    if (lower.includes(keyword)) {
      detected.push(keyword);
    }
  }
  
  return detected;
}

/**
 * Check if text mentions a material
 */
function detectMaterialMention(text: string): boolean {
  const lower = text.toLowerCase();
  return Array.from(MATERIAL_KEYWORDS).some(keyword => lower.includes(keyword));
}

/**
 * Detect which materials are mentioned
 */
function detectMaterials(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  
  for (const keyword of MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      detected.push(keyword);
    }
  }
  
  return detected;
}

/**
 * Check if text mentions a location
 */
function detectLocationMention(text: string): boolean {
  const lower = text.toLowerCase();
  return Array.from(LOCATION_KEYWORDS).some(keyword => lower.includes(keyword));
}

/**
 * Detect which locations are mentioned
 */
function detectLocations(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  
  for (const keyword of LOCATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      detected.push(keyword);
    }
  }
  
  return detected;
}

/**
 * Check if text contains a question
 */
function detectQuestion(text: string): boolean {
  return QUESTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains a contact request
 */
function detectContactRequest(text: string): boolean {
  return CONTACT_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains a phone number
 */
function detectPhone(text: string): boolean {
  return PHONE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains an email
 */
function detectEmail(text: string): boolean {
  return EMAIL_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains a URL
 */
function detectUrl(text: string): boolean {
  return URL_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains profanity
 * (Uses the same profanity list as the classifier)
 */
function detectProfanity(text: string): boolean {
  const PROFANITY_LIST = new Set([
    'damn', 'hell', 'shit', 'fuck', 'ass', 'bitch', 'bastard', 'crap',
    'suck', 'sucks', 'stupid', 'idiot', 'dumb', 'moron', 'retard',
  ]);
  
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
  return tokens.some(word => PROFANITY_LIST.has(word));
}

/**
 * Check if text contains spam patterns
 * (Uses the same spam patterns as the classifier)
 */
function detectSpamPatterns(text: string): boolean {
  const SPAM_PATTERNS = [
    /\b(click here)\b/gi,
    /\b(buy now)\b/gi,
    /\b(free money)\b/gi,
    /\b(win prize)\b/gi,
    /\b(urgent)\b/gi,
    /\b(act now)\b/gi,
    /\b(limited time)\b/gi,
    /(.)\1{4,}/g, // Repeated characters
    /\b\d{10,}\b/g, // Long numbers
    /[A-Z]{5,}/g, // Excessive caps
  ];
  
  return SPAM_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Extract all metadata from review text
 */
export function extractMetadata(text: string): ReviewMetadata {
  return {
    mentions_project: detectServiceMention(text) || detectMaterialMention(text),
    mentions_service: detectServiceMention(text),
    mentions_employee: detectEmployeeMention(text),
    mentions_material: detectMaterialMention(text),
    mentions_location: detectLocationMention(text),
    estimated_length: text.length,
    contains_question: detectQuestion(text),
    contains_contact_request: detectContactRequest(text),
    contains_phone: detectPhone(text),
    contains_email: detectEmail(text),
    contains_url: detectUrl(text),
    contains_profanity: detectProfanity(text),
    contains_spam_patterns: detectSpamPatterns(text),
    detected_services: detectServices(text),
    detected_materials: detectMaterials(text),
    detected_employees: detectEmployees(text),
    detected_locations: detectLocations(text),
  };
}

/**
 * Extract metadata with extensible classifier format
 * This allows future metadata extractors to plug into the same pipeline
 */
export function extractMetadataWithClassifierFormat(text: string): {
  metadata: ReviewMetadata;
  classifiers: {
    employee_mention: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    service_mention: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    material_mention: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    location_mention: {
      value: boolean;
      confidence: number;
      classifiedAt: string;
    };
    contact_request: {
      value: boolean;
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
  };
} {
  const metadata = extractMetadata(text);
  const now = new Date().toISOString();
  
  return {
    metadata,
    classifiers: {
      employee_mention: {
        value: metadata.mentions_employee,
        confidence: metadata.mentions_employee ? 0.95 : 0.9,
        classifiedAt: now,
      },
      service_mention: {
        value: metadata.mentions_service,
        confidence: metadata.mentions_service ? 0.9 : 0.85,
        classifiedAt: now,
      },
      material_mention: {
        value: metadata.mentions_material,
        confidence: metadata.mentions_material ? 0.9 : 0.85,
        classifiedAt: now,
      },
      location_mention: {
        value: metadata.mentions_location,
        confidence: metadata.mentions_location ? 0.85 : 0.8,
        classifiedAt: now,
      },
      contact_request: {
        value: metadata.contains_contact_request,
        confidence: metadata.contains_contact_request ? 0.95 : 0.9,
        classifiedAt: now,
      },
      profanity: {
        value: metadata.contains_profanity,
        confidence: metadata.contains_profanity ? 0.9 : 0.95,
        classifiedAt: now,
      },
      spam: {
        value: metadata.contains_spam_patterns,
        confidence: metadata.contains_spam_patterns ? 0.8 : 0.9,
        classifiedAt: now,
      },
    },
  };
}
