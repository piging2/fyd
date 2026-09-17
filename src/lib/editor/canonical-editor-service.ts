/**
 * Canonical Editor Service
 * 
 * Constitutional Law: UI Does Not Mutate Graph
 * 
 * The UI emits simple intents.
 * The canonicalizer resolves targets, constraints, and media policy.
 * The service constructs canonical commands, validates, and produces events.
 * 
 * This boundary hides implementation complexity from the UI.
 * The UI never needs to understand backend variants.
 */

export type EditorIntentKind =
  | 'set-media'
  | 'move'
  | 'swap'
  | 'remove'
  | 'duplicate'
  | 'crop'
  | 'focus';

export interface EditorIntent {
  kind: EditorIntentKind;
  target: string;
  value?: unknown;
}

export interface CommandResult {
  success: boolean;
  commandId?: string;
  error?: string;
}

class CanonicalEditorService {
  private static instance: CanonicalEditorService;

  private constructor() {}

  static getInstance(): CanonicalEditorService {
    if (!CanonicalEditorService.instance) {
      CanonicalEditorService.instance = new CanonicalEditorService();
    }
    return CanonicalEditorService.instance;
  }

  /**
   * Execute an editor intent
   * This is the single entry point for all editor operations
   */
  async execute(intent: EditorIntent): Promise<CommandResult> {
    try {
      // Resolve target
      const targetInfo = await this.resolveTarget(intent.target);
      
      // Resolve constraints
      const constraints = await this.resolveConstraints(intent.target);
      
      // Canonicalize value based on intent type and constraints
      const canonicalValue = await this.canonicalizeValue(intent, constraints);
      
      // Construct canonical command
      const command = await this.constructCommand(intent, targetInfo, canonicalValue);
      
      // Validate command
      await this.validateCommand(command);
      
      // Execute command (produces events)
      const { commandExecutor } = await import('./command-pattern');
      await commandExecutor.execute(command);
      
      return {
        success: true,
        commandId: command.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Resolve target (slot, placement, asset)
   */
  private async resolveTarget(target: string): Promise<any> {
    const { slotRegistry } = await import('./slot-registry');
    const { placementGraph } = await import('./placement-graph');
    
    // Try to resolve as slot
    const slot = slotRegistry.getSlot(target);
    if (slot) {
      return { type: 'slot', data: slot };
    }
    
    // Try to resolve as placement
    const placement = placementGraph.getPlacement(target);
    if (placement) {
      return { type: 'placement', data: placement };
    }
    
    throw new Error(`Cannot resolve target: ${target}`);
  }

  /**
   * Resolve constraints for target
   */
  private async resolveConstraints(target: string): Promise<any> {
    const { slotRegistry } = await import('./slot-registry');
    
    const slot = slotRegistry.getSlot(target);
    if (slot) {
      return slot.constraints;
    }
    
    // Default constraints if no slot found
    return {
      aspectRatio: 'auto',
      responsive: true,
      focalPointEnabled: false,
      minWidth: 0,
      compressionPreset: 'default'
    };
  }

  /**
   * Canonicalize value based on intent and constraints
   * This is where the "million variants" problem is eliminated
   */
  private async canonicalizeValue(intent: EditorIntent, constraints: any): Promise<any> {
    switch (intent.kind) {
      case 'set-media':
        // Value is asset ID
        // Apply media policy based on constraints
        return {
          assetId: intent.value as string,
          // Runtime will determine canonical crop, focal point, format, etc.
        };
      
      case 'move':
        // Value is target slot ID
        return {
          targetSlotId: intent.value as string
        };
      
      case 'remove':
        // No value needed
        return {};
      
      case 'duplicate':
        // Value is target slot ID
        return {
          targetSlotId: intent.value as string
        };
      
      case 'crop':
        // Value is crop region
        // Apply constraints validation
        return {
          crop: intent.value as { x: number; y: number; width: number; height: number }
        };
      
      case 'focus':
        // Value is focal point
        return {
          focalPoint: intent.value as { x: number; y: number }
        };
      
      default:
        throw new Error(`Unknown intent kind: ${intent.kind}`);
    }
  }

  /**
   * Construct canonical command from intent
   */
  private async constructCommand(intent: EditorIntent, targetInfo: any, canonicalValue: any): Promise<any> {
    const { commandBuilder } = await import('./command-pattern');
    
    switch (intent.kind) {
      case 'set-media':
        if (targetInfo.type === 'slot') {
          return commandBuilder.replaceAsset({
            slotId: intent.target,
            newAssetId: canonicalValue.assetId
          });
        }
        throw new Error('set-media requires slot target');
      
      case 'move':
        if (targetInfo.type === 'placement') {
          return commandBuilder.movePlacement({
            placementId: intent.target,
            newSlotId: canonicalValue.targetSlotId
          });
        }
        throw new Error('move requires placement target');
      
      case 'remove':
        if (targetInfo.type === 'placement') {
          return commandBuilder.deletePlacement({
            placementId: intent.target
          });
        }
        throw new Error('remove requires placement target');
      
      case 'duplicate':
        if (targetInfo.type === 'placement') {
          return commandBuilder.duplicatePlacement({
            sourcePlacementId: intent.target,
            targetSlotId: canonicalValue.targetSlotId
          });
        }
        throw new Error('duplicate requires placement target');
      
      case 'crop':
        if (targetInfo.type === 'placement') {
          const assetId = targetInfo.data.assetId;
          return commandBuilder.cropAsset({
            assetId,
            newCrop: canonicalValue.crop
          });
        }
        throw new Error('crop requires placement target');
      
      case 'focus':
        if (targetInfo.type === 'placement') {
          const assetId = targetInfo.data.assetId;
          return commandBuilder.adjustFocalPoint({
            assetId,
            newFocalPoint: canonicalValue.focalPoint
          });
        }
        throw new Error('focus requires placement target');
      
      default:
        throw new Error(`Unknown intent kind: ${intent.kind}`);
    }
  }

  /**
   * Validate command before execution
   */
  private async validateCommand(command: any): Promise<void> {
    // Add validation logic
    // This is where we enforce business rules
    console.log('Validating command:', command);
  }
}

export const canonicalEditorService = CanonicalEditorService.getInstance();
