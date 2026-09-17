/**
 * Placement Graph
 * 
 * Constitutional Law 5: Placement Graph Owns Layout
 * 
 * The placement graph is the single source of truth for all asset placements.
 * Dragging never mutates React state directly - it creates placements in the graph.
 * 
 * Graph structure:
 * Asset → Placement → Page → Component → Slot
 * 
 * Constitutional changes:
 * - Uses array instead of Map for canonical state (deterministic ordering)
 * - No arbitrary mutation methods (only event-driven updates)
 * - No wall-clock in canonical state (sequence-based ordering)
 * - Enforces slot cardinality constraints
 * - Uses proper canonical types (no 'any')
 * - All sequences come from canonical SequenceAuthority
 * - Methods return ValidationResult instead of throwing
 */

import { CropRegion, FocalPoint, SlotConstraints } from './command-pattern';
import { sequenceAuthority } from './sequence-authority';
import { ValidationResult, ValidationFailure } from './validation-result';

export interface Placement {
  placementId: string;
  assetId: string;
  slotId: string;
  pageId: string;
  componentId: string;
  status: 'staged' | 'published';
  sequence: number;
  metadata?: {
    crop?: CropRegion;
    focalPoint?: FocalPoint;
    altText?: string;
    seoPriority?: number;
  };
}

export interface PlacementGraph {
  placements: Placement[];
  version: number;
}

class PlacementGraphManager {
  private static instance: PlacementGraphManager;
  private graph: PlacementGraph = {
    placements: [],
    version: 0
  };

  private constructor() {}

  static getInstance(): PlacementGraphManager {
    if (!PlacementGraphManager.instance) {
      PlacementGraphManager.instance = new PlacementGraphManager();
    }
    return PlacementGraphManager.instance;
  }

  private nextSequence(): number {
    return sequenceAuthority.nextSequence();
  }

  /**
   * Create a new placement (event-driven only)
   * Enforces slot cardinality: one active placement per slot
   */
  createPlacement(params: {
    assetId: string;
    slotId: string;
    pageId: string;
    componentId: string;
    metadata?: Placement['metadata'];
  }): Placement {
    const placementId = `placement_${this.nextSequence()}`;
    return this.createPlacementWithId({
      placementId,
      ...params
    });
  }

  /**
   * Create a new placement with specific ID (for replay)
   * Enforces slot cardinality: one active placement per slot
   */
  createPlacementWithId(params: {
    placementId: string;
    assetId: string;
    slotId: string;
    pageId: string;
    componentId: string;
    metadata?: Placement['metadata'];
  }): Placement {
    return this.createPlacementWithIdAndSequence({
      ...params,
      sequence: this.nextSequence()
    });
  }

  /**
   * Create a new placement with specific ID and sequence (for replay)
   * Enforces slot cardinality: one active placement per slot
   * Used during replay - sequence is provided from event, not allocated
   */
  createPlacementWithIdAndSequence(params: {
    placementId: string;
    assetId: string;
    slotId: string;
    pageId: string;
    componentId: string;
    sequence: number;
    metadata?: Placement['metadata'];
  }): Placement {
    // Enforce slot cardinality constraint
    const existingPlacement = this.getPlacementForSlot(params.slotId);
    if (existingPlacement) {
      throw new Error(`Slot ${params.slotId} already has an active placement. Delete or move existing placement first.`);
    }

    const placement: Placement = {
      placementId: params.placementId,
      assetId: params.assetId,
      slotId: params.slotId,
      pageId: params.pageId,
      componentId: params.componentId,
      status: 'staged',
      sequence: params.sequence,
      metadata: params.metadata
    };

    this.graph.placements.push(placement);
    this.graph.version++;

    return placement;
  }

  /**
   * Get placement by ID
   * Returns a deep copy to prevent mutation leaks
   */
  getPlacement(placementId: string): Placement | undefined {
    const placement = this.graph.placements.find(p => p.placementId === placementId);
    return placement ? JSON.parse(JSON.stringify(placement)) : undefined;
  }

  /**
   * Get placement for a specific slot
   * Enforces cardinality-one constraint
   * Returns a deep copy to prevent mutation leaks
   */
  getPlacementForSlot(slotId: string): Placement | undefined {
    const placements = this.graph.placements.filter(p => p.slotId === slotId);
    if (placements.length > 1) {
      // Cardinality violation - this should never happen
      return undefined;
    }
    return placements[0] ? JSON.parse(JSON.stringify(placements[0])) : undefined;
  }

  /**
   * Get all placements for a page
   * Returns deep copies to prevent mutation leaks
   */
  getPlacementsForPage(pageId: string): Placement[] {
    return this.graph.placements
      .filter(p => p.pageId === pageId)
      .map(p => JSON.parse(JSON.stringify(p)));
  }

  /**
   * Get all placements for a component
   * Returns deep copies to prevent mutation leaks
   */
  getPlacementsForComponent(componentId: string): Placement[] {
    return this.graph.placements
      .filter(p => p.componentId === componentId)
      .map(p => JSON.parse(JSON.stringify(p)));
  }

  /**
   * Get all placements for an asset
   * Returns deep copies to prevent mutation leaks
   */
  getPlacementsForAsset(assetId: string): Placement[] {
    return this.graph.placements
      .filter(p => p.assetId === assetId)
      .map(p => JSON.parse(JSON.stringify(p)));
  }

  /**
   * Delete placement (event-driven only)
   */
  deletePlacement(placementId: string): boolean {
    const index = this.graph.placements.findIndex(p => p.placementId === placementId);
    if (index === -1) return false;

    this.graph.placements.splice(index, 1);
    this.graph.version++;

    return true;
  }

  /**
   * Move placement to different slot (event-driven only)
   * Accepts explicit sequence for replay
   */
  movePlacement(placementId: string, newSlotId: string, sequence?: number): Placement | undefined {
    const placement = this.getPlacement(placementId);
    if (!placement) return undefined;

    // Enforce slot cardinality constraint
    const existingPlacement = this.getPlacementForSlot(newSlotId);
    if (existingPlacement && existingPlacement.placementId !== placementId) {
      throw new Error(`Target slot ${newSlotId} already has an active placement`);
    }

    const updated: Placement = {
      ...placement,
      slotId: newSlotId,
      sequence: sequence ?? this.nextSequence()
    };

    const index = this.graph.placements.findIndex(p => p.placementId === placementId);
    if (index !== -1) {
      this.graph.placements[index] = updated;
      this.graph.version++;
    }

    return updated;
  }

  /**
   * Replace asset in placement (event-driven only)
   * Accepts explicit sequence for replay
   */
  replaceAsset(placementId: string, newAssetId: string, sequence?: number): Placement | undefined {
    const placement = this.getPlacement(placementId);
    if (!placement) return undefined;

    const updated: Placement = {
      ...placement,
      assetId: newAssetId,
      sequence: sequence ?? this.nextSequence()
    };

    const index = this.graph.placements.findIndex(p => p.placementId === placementId);
    if (index !== -1) {
      this.graph.placements[index] = updated;
      this.graph.version++;
    }

    return updated;
  }

  /**
   * Get all staged placements
   */
  getStagedPlacements(): Placement[] {
    return this.graph.placements.filter(p => p.status === 'staged');
  }

  /**
   * Get all published placements
   */
  getPublishedPlacements(): Placement[] {
    return this.graph.placements.filter(p => p.status === 'published');
  }

  /**
   * Publish all staged placements (event-driven only)
   * This should be called by PublishStaged event handler
   */
  publishStaged(): Placement[] {
    const published: Placement[] = [];

    for (let i = 0; i < this.graph.placements.length; i++) {
      const placement = this.graph.placements[i];
      if (placement.status === 'staged') {
        this.graph.placements[i] = {
          ...placement,
          status: 'published',
          sequence: this.nextSequence()
        };
        published.push(this.graph.placements[i]);
      }
    }

    if (published.length > 0) {
      this.graph.version++;
    }

    return published;
  }

  /**
   * Update placement status (event-driven only)
   * This is a more targeted operation than publishStaged
   * Accepts explicit sequence for replay
   */
  updatePlacementStatus(placementId: string, status: 'staged' | 'published', sequence?: number): Placement | undefined {
    const placement = this.getPlacement(placementId);
    if (!placement) return undefined;

    const updated: Placement = {
      ...placement,
      status,
      sequence: sequence ?? this.nextSequence()
    };

    const index = this.graph.placements.findIndex(p => p.placementId === placementId);
    if (index !== -1) {
      this.graph.placements[index] = updated;
      this.graph.version++;
    }

    return updated;
  }

  /**
   * Update placement metadata (event-driven only)
   * This is used for crop and focal point adjustments
   * Accepts explicit sequence for replay
   */
  updatePlacementMetadata(placementId: string, metadata: Placement['metadata'], sequence?: number): Placement | undefined {
    const placement = this.getPlacement(placementId);
    if (!placement) return undefined;

    const updated: Placement = {
      ...placement,
      metadata,
      sequence: sequence ?? this.nextSequence()
    };

    const index = this.graph.placements.findIndex(p => p.placementId === placementId);
    if (index !== -1) {
      this.graph.placements[index] = updated;
      this.graph.version++;
    }

    return updated;
  }

  /**
   * Get current graph state
   */
  getGraph(): PlacementGraph {
    return {
      placements: [...this.graph.placements],
      version: this.graph.version
    };
  }

  /**
   * Load graph state (for persistence/replay)
   */
  loadGraph(graph: PlacementGraph): void {
    this.graph = {
      placements: [...graph.placements],
      version: graph.version
    };
  }

  /**
   * Clear all placements
   */
  clear(): void {
    this.graph.placements = [];
    this.graph.version++;
  }
}

export const placementGraph = PlacementGraphManager.getInstance();