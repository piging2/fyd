/**
 * Classifier Provider Interface - Stage 13 of Review Moderation Pipeline
 * 
 * Architecture: Review Submission → Normalizer → Metadata Extractor → Classification → Quality Score → Duplicate Detection → Tag Suggestion → Service Suggestion → Project Suggestion → County Suggestion → Audit Trail → Moderation
 * 
 * This provider interface allows future AI classifiers to plug into the same pipeline.
 * The rest of the application never knows which classifier is being used.
 * Changing providers requires replacing one adapter, not rewriting the moderation system.
 * 
 * Current implementation: VADER (rule-based, local)
 * Future implementations: OpenAI, Claude, Gemini, Local LLM
 */

export interface SentimentClassificationResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  bucket: 'positive' | 'review';
  confidence: number; // 0.00-1.00
  hasProfanity: boolean;
  hasSpam: boolean;
  hasQuestion: boolean;
  compoundScore: number;
}

export interface ClassifierMetadata {
  provider: string;
  version: string;
  model?: string;
  latency?: number; // milliseconds
  cost?: number; // tokens or cost units
}

export interface ClassifierResult {
  classification: SentimentClassificationResult;
  metadata: ClassifierMetadata;
}

/**
 * Classifier Provider Interface
 * All classifiers must implement this interface
 */
export interface ClassifierProvider {
  /**
   * Provider name (e.g., 'vader', 'openai', 'claude', 'gemini')
   */
  readonly providerName: string;

  /**
   * Provider version
   */
  readonly version: string;

  /**
   * Model name (if applicable)
   */
  readonly model?: string;

  /**
   * Classify review text
   */
  classify(text: string, rating?: number): Promise<ClassifierResult>;

  /**
   * Classify review text with metadata
   */
  classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

/**
 * VADER Classifier Provider (Current Implementation)
 * Rule-based, local, no external API calls
 */
export class VaderClassifierProvider implements ClassifierProvider {
  readonly providerName = 'vader';
  readonly version = '1.0.0';
  readonly model = 'vader-lexicon';

  /**
   * Classify using VADER algorithm
   * (Implementation imported from classifier.ts)
   */
  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    // Import the actual VADER implementation
    const { classifyReview } = await import('./classifier');
    const result = classifyReview(text, rating);

    return {
      classification: result,
      metadata: {
        provider: this.providerName,
        version: this.version,
        model: this.model,
        latency: 0, // Local, negligible latency
      },
    };
  }

  /**
   * Classify with metadata
   */
  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    const { classifyReviewWithMetadata } = await import('./classifier');
    const result = classifyReviewWithMetadata(text, rating);

    return {
      classification: {
        sentiment: result.sentiment,
        bucket: result.bucket,
        confidence: result.confidence,
        hasProfanity: result.classifiers.profanity.value,
        hasSpam: result.classifiers.spam.value,
        hasQuestion: result.classifiers.question.value,
        compoundScore: 0, // Would need to be calculated separately
      },
      metadata: {
        provider: this.providerName,
        version: this.version,
        model: this.model,
        latency: 0,
      },
    };
  }

  /**
   * Health check (always true for local VADER)
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * OpenAI Classifier Provider (Future Implementation)
 * Placeholder for future OpenAI GPT integration
 */
export class OpenAIClassifierProvider implements ClassifierProvider {
  readonly providerName = 'openai';
  readonly version = '1.0.0';
  readonly model = 'gpt-4';

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement OpenAI API call
    // Would use OpenAI API to classify sentiment
    throw new Error('OpenAI classifier not yet implemented');
  }

  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement OpenAI API call with metadata
    throw new Error('OpenAI classifier not yet implemented');
  }

  async healthCheck(): Promise<boolean> {
    // Placeholder - check OpenAI API availability
    return true;
  }
}

/**
 * Claude Classifier Provider (Future Implementation)
 * Placeholder for future Anthropic Claude integration
 */
export class ClaudeClassifierProvider implements ClassifierProvider {
  readonly providerName = 'claude';
  readonly version = '1.0.0';
  readonly model = 'claude-3-opus';

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement Claude API call
    throw new Error('Claude classifier not yet implemented');
  }

  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement Claude API call with metadata
    throw new Error('Claude classifier not yet implemented');
  }

  async healthCheck(): Promise<boolean> {
    // Placeholder - check Claude API availability
    return true;
  }
}

/**
 * Gemini Classifier Provider (Future Implementation)
 * Placeholder for future Google Gemini integration
 */
export class GeminiClassifierProvider implements ClassifierProvider {
  readonly providerName = 'gemini';
  readonly version = '1.0.0';
  readonly model = 'gemini-pro';

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement Gemini API call
    throw new Error('Gemini classifier not yet implemented');
  }

  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement Gemini API call with metadata
    throw new Error('Gemini classifier not yet implemented');
  }

  async healthCheck(): Promise<boolean> {
    // Placeholder - check Gemini API availability
    return true;
  }
}

/**
 * Local LLM Classifier Provider (Future Implementation)
 * Placeholder for future local LLM integration (e.g., Llama, Mistral)
 */
export class LocalLLMClassifierProvider implements ClassifierProvider {
  readonly providerName = 'local-llm';
  readonly version = '1.0.0';
  readonly model = 'llama-2-7b';

  private modelPath: string;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement local LLM inference
    throw new Error('Local LLM classifier not yet implemented');
  }

  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    // Placeholder - implement local LLM inference with metadata
    throw new Error('Local LLM classifier not yet implemented');
  }

  async healthCheck(): Promise<boolean> {
    // Placeholder - check local model availability
    return true;
  }
}

/**
 * Classifier Factory
 * Creates classifier providers based on configuration
 */
export class ClassifierFactory {
  /**
   * Create a classifier provider based on provider name
   */
  static createProvider(providerName: string, config?: any): ClassifierProvider {
    switch (providerName) {
      case 'vader':
        return new VaderClassifierProvider();
      case 'openai':
        if (!config?.apiKey) throw new Error('OpenAI API key required');
        return new OpenAIClassifierProvider(config.apiKey);
      case 'claude':
        if (!config?.apiKey) throw new Error('Claude API key required');
        return new ClaudeClassifierProvider(config.apiKey);
      case 'gemini':
        if (!config?.apiKey) throw new Error('Gemini API key required');
        return new GeminiClassifierProvider(config.apiKey);
      case 'local-llm':
        if (!config?.modelPath) throw new Error('Local LLM model path required');
        return new LocalLLMClassifierProvider(config.modelPath);
      default:
        throw new Error(`Unknown classifier provider: ${providerName}`);
    }
  }

  /**
   * Get the default classifier provider
   * Currently defaults to VADER (local, no API required)
   */
  static getDefaultProvider(): ClassifierProvider {
    return new VaderClassifierProvider();
  }

  /**
   * Get available provider names
   */
  static getAvailableProviders(): string[] {
    return ['vader', 'openai', 'claude', 'gemini', 'local-llm'];
  }
}

/**
 * Classifier Manager
 * Manages the active classifier provider
 */
export class ClassifierManager {
  private provider: ClassifierProvider;

  constructor(provider?: ClassifierProvider) {
    this.provider = provider || ClassifierFactory.getDefaultProvider();
  }

  /**
   * Set the active classifier provider
   */
  setProvider(provider: ClassifierProvider): void {
    this.provider = provider;
  }

  /**
   * Get the active classifier provider
   */
  getProvider(): ClassifierProvider {
    return this.provider;
  }

  /**
   * Classify using the active provider
   */
  async classify(text: string, rating?: number): Promise<ClassifierResult> {
    return this.provider.classify(text, rating);
  }

  /**
   * Classify with metadata using the active provider
   */
  async classifyWithMetadata(text: string, rating?: number): Promise<ClassifierResult> {
    return this.provider.classifyWithMetadata(text, rating);
  }

  /**
   * Health check the active provider
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }
}

/**
 * Singleton instance of the classifier manager
 * Use this throughout the application
 */
export const classifierManager = new ClassifierManager();
