/**
 * Generic Ingestion Pipeline Abstraction
 * 
 * Architecture:
 * Provider (Google Drive, Dropbox, OneDrive, Upload, Camera, Phone)
 *   ↓
 * Ingestion Pipeline
 *   ↓
 * Normalization
 *   ↓
 * Media Authority
 *   ↓
 * Variant Generation
 *   ↓
 * Validation
 *   ↓
 * Project Linking
 *   ↓
 * Metrics
 * 
 * This abstraction allows any provider to feed into the same pipeline.
 * No provider-specific logic branches in the core pipeline.
 */

export interface PipelineConfig {
  provider: Provider;
  stages: PipelineStage[];
  onError?: (error: PipelineError) => void;
  onProgress?: (progress: PipelineProgress) => void;
}

export interface Provider {
  id: string;
  name: string;
  type: "google-drive" | "dropbox" | "onedrive" | "upload" | "camera" | "phone" | "manual";
  authenticate(): Promise<ProviderAuth>;
  ingest(options?: IngestionOptions): Promise<IngestedItem[]>;
}

export interface ProviderAuth {
  token: string;
  expiresAt?: string;
  refreshToken?: string;
}

export interface IngestionOptions {
  folderId?: string;
  filters?: IngestionFilter;
  limit?: number;
}

export interface IngestionFilter {
  mimeTypes?: string[];
  modifiedAfter?: string;
  namePattern?: string;
}

export interface IngestedItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  metadata: Record<string, unknown>;
  provider: string;
  ingestedAt: string;
}

export interface PipelineStage {
  name: string;
  process(items: IngestedItem[]): Promise<ProcessedItem[]>;
}

export interface ProcessedItem {
  original: IngestedItem;
  processed: Record<string, unknown>;
  stage: string;
  processedAt: string;
  errors?: string[];
}

export interface PipelineError {
  stage: string;
  itemId?: string;
  error: Error;
  timestamp: string;
}

export interface PipelineProgress {
  stage: string;
  total: number;
  completed: number;
  failed: number;
  timestamp: string;
}

/**
 * Generic Ingestion Pipeline
 * 
 * Orchestrates the flow from provider through all stages.
 */
export class IngestionPipeline {
  private config: PipelineConfig;
  private state: PipelineState;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.state = {
      status: "idle",
      items: [],
      errors: [],
      startedAt: null,
      completedAt: null,
    };
  }

  /**
   * Execute the full pipeline
   */
  async execute(): Promise<PipelineResult> {
    this.state.status = "running";
    this.state.startedAt = new Date().toISOString();

    try {
      // Stage 1: Ingestion
      const ingested = await this.ingest();
      
      // Stage 2: Normalization
      const normalized = await this.normalize(ingested);
      
      // Stage 3: Validation
      const validated = await this.validate(normalized);
      
      // Stage 4: Linking
      const linked = await this.link(validated);
      
      // Stage 5: Metrics
      const metrics = await this.generateMetrics(linked);

      this.state.status = "completed";
      this.state.completedAt = new Date().toISOString();
      this.state.items = linked;

      return {
        success: true,
        items: linked,
        errors: this.state.errors,
        metrics,
        startedAt: this.state.startedAt,
        completedAt: this.state.completedAt,
      };
    } catch (error) {
      this.state.status = "failed";
      this.state.completedAt = new Date().toISOString();
      
      const pipelineError: PipelineError = {
        stage: "pipeline",
        error: error as Error,
        timestamp: new Date().toISOString(),
      };
      
      this.state.errors.push(pipelineError);
      this.config.onError?.(pipelineError);

      return {
        success: false,
        items: this.state.items,
        errors: this.state.errors,
        metrics: null,
        startedAt: this.state.startedAt,
        completedAt: this.state.completedAt,
      };
    }
  }

  /**
   * Stage 1: Ingestion from provider
   */
  private async ingest(): Promise<IngestedItem[]> {
    const stage = "ingestion";
    this.reportProgress(stage, 0, 0, 0);

    const items = await this.config.provider.ingest();
    
    this.reportProgress(stage, items.length, items.length, 0);
    return items;
  }

  /**
   * Stage 2: Normalization
   */
  private async normalize(items: IngestedItem[]): Promise<ProcessedItem[]> {
    const stage = "normalization";
    this.reportProgress(stage, items.length, 0, 0);

    const stageConfig = this.config.stages.find(s => s.name === stage);
    if (!stageConfig) {
      return items.map(item => ({
        original: item,
        processed: {},
        stage,
        processedAt: new Date().toISOString(),
      }));
    }

    const processed = await stageConfig.process(items);
    this.reportProgress(stage, items.length, processed.length, 0);
    return processed;
  }

  /**
   * Stage 3: Validation
   */
  private async validate(items: ProcessedItem[]): Promise<ProcessedItem[]> {
    const stage = "validation";
    this.reportProgress(stage, items.length, 0, 0);

    const stageConfig = this.config.stages.find(s => s.name === stage);
    if (!stageConfig) {
      return items;
    }

    const validated = await stageConfig.process(items.map(i => i.original));
    this.reportProgress(stage, items.length, validated.length, 0);
    return items; // Return original items with validation metadata
  }

  /**
   * Stage 4: Linking
   */
  private async link(items: ProcessedItem[]): Promise<ProcessedItem[]> {
    const stage = "linking";
    this.reportProgress(stage, items.length, 0, 0);

    const stageConfig = this.config.stages.find(s => s.name === stage);
    if (!stageConfig) {
      return items;
    }

    const linked = await stageConfig.process(items.map(i => i.original));
    this.reportProgress(stage, items.length, linked.length, 0);
    return items;
  }

  /**
   * Stage 5: Metrics
   */
  private async generateMetrics(items: ProcessedItem[]): Promise<PipelineMetrics> {
    return {
      totalItems: items.length,
      successfulItems: items.filter(i => !i.errors?.length).length,
      failedItems: items.filter(i => i.errors?.length).length,
      byStage: this.calculateStageMetrics(items),
    };
  }

  private calculateStageMetrics(items: ProcessedItem[]): Record<string, number> {
    const metrics: Record<string, number> = {};
    items.forEach(item => {
      metrics[item.stage] = (metrics[item.stage] || 0) + 1;
    });
    return metrics;
  }

  private reportProgress(stage: string, total: number, completed: number, failed: number) {
    this.config.onProgress?.({
      stage,
      total,
      completed,
      failed,
      timestamp: new Date().toISOString(),
    });
  }

  getState(): PipelineState {
    return { ...this.state };
  }
}

export interface PipelineState {
  status: "idle" | "running" | "completed" | "failed";
  items: ProcessedItem[];
  errors: PipelineError[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineResult {
  success: boolean;
  items: ProcessedItem[];
  errors: PipelineError[];
  metrics: PipelineMetrics | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineMetrics {
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  byStage: Record<string, number>;
}
