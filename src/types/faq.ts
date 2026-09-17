/**
 * FAQ Authority Types
 * 
 * Frequently asked questions as a constitutional authority.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FaqManifest {
  version: string;
  generatedAt: string;
  faqs: FaqItem[];
}
