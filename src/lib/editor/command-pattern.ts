/**
 * Command Pattern System
 * 
 * Constitutional Law 5: Placement Graph Owns Layout
 * Constitutional Law 9: Every Edit Is A Command
 * 
 * Every operation becomes a command that is:
 * - replayable
 * - undoable
 * - auditable
 * 
 * Commands never mutate state directly - they produce events.
 * Command IDs are deterministic (sequence-based, not time-based).
 * All sequences come from one canonical SequenceAuthority.
 */

import { sequenceAuthority } from './sequence-authority';
import { ValidationFailure, ValidationResult } from './validation-result';

export interface Command {
  id: string;
  type: CommandType;
  sequence: number;
  userId?: string;
}

export type CommandType =
  | 'ReplaceAsset'
  | 'MovePlacement'
  | 'SwapPlacement'
  | 'DeletePlacement'
  | 'DuplicatePlacement'
  | 'CropAsset'
  | 'AdjustFocalPoint'
  | 'UpdateSlotConstraints'
  | 'PublishStaged'
  | 'BatchOperation';

export interface ReplaceAssetCommand extends Command {
  type: 'ReplaceAsset';
  slotId: string;
  newAssetId: string;
}

export interface MovePlacementCommand extends Command {
  type: 'MovePlacement';
  placementId: string;
  newSlotId: string;
}

export interface SwapPlacementCommand extends Command {
  type: 'SwapPlacement';
  placementId1: string;
  placementId2: string;
}

export interface DeletePlacementCommand extends Command {
  type: 'DeletePlacement';
  placementId: string;
}

export interface DuplicatePlacementCommand extends Command {
  type: 'DuplicatePlacement';
  sourcePlacementId: string;
  newPlacementId: string;
  targetSlotId: string;
}

export interface CropAssetCommand extends Command {
  type: 'CropAsset';
  assetId: string;
  newCrop: CropRegion;
}

export interface AdjustFocalPointCommand extends Command {
  type: 'AdjustFocalPoint';
  assetId: string;
  newFocalPoint: FocalPoint;
}

export interface UpdateSlotConstraintsCommand extends Command {
  type: 'UpdateSlotConstraints';
  slotId: string;
  newConstraints: SlotConstraints;
}

export interface PublishStagedCommand extends Command {
  type: 'PublishStaged';
}

export interface BatchOperationCommand extends Command {
  type: 'BatchOperation';
  commands: AnyCommand[];
}

export type AnyCommand = 
  | ReplaceAssetCommand
  | MovePlacementCommand
  | SwapPlacementCommand
  | DeletePlacementCommand
  | DuplicatePlacementCommand
  | CropAssetCommand
  | AdjustFocalPointCommand
  | UpdateSlotConstraintsCommand
  | PublishStagedCommand
  | BatchOperationCommand;

// Canonical value objects
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FocalPoint {
  x: number;
  y: number;
}

export interface SlotConstraints {
  aspectRatio: string;
  responsive: boolean;
  focalPointEnabled: boolean;
  minWidth: number;
  compressionPreset: string;
}

/**
 * Command Builder
 * Type-safe command creation with deterministic IDs
 */
class CommandBuilder {
  private static generateId(sequence: number): string {
    return `cmd_${sequence}`;
  }

  static replaceAsset(params: {
    slotId: string;
    newAssetId: string;
  }): ReplaceAssetCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'ReplaceAsset',
      sequence,
      ...params
    };
  }

  static movePlacement(params: {
    placementId: string;
    newSlotId: string;
  }): MovePlacementCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'MovePlacement',
      sequence,
      ...params
    };
  }

  static swapPlacement(params: {
    placementId1: string;
    placementId2: string;
  }): SwapPlacementCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'SwapPlacement',
      sequence,
      ...params
    };
  }

  static deletePlacement(params: {
    placementId: string;
  }): DeletePlacementCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'DeletePlacement',
      sequence,
      ...params
    };
  }

  static duplicatePlacement(params: {
    sourcePlacementId: string;
    targetSlotId: string;
  }): DuplicatePlacementCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    // Use same sequence for placement ID to establish causal relationship
    const newPlacementId = `placement_${sequence}`;
    
    return {
      id: commandId,
      type: 'DuplicatePlacement',
      sequence,
      sourcePlacementId: params.sourcePlacementId,
      newPlacementId,
      targetSlotId: params.targetSlotId
    };
  }

  static cropAsset(params: {
    assetId: string;
    newCrop: CropRegion;
  }): CropAssetCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'CropAsset',
      sequence,
      ...params
    };
  }

  static adjustFocalPoint(params: {
    assetId: string;
    newFocalPoint: FocalPoint;
  }): AdjustFocalPointCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'AdjustFocalPoint',
      sequence,
      ...params
    };
  }

  static updateSlotConstraints(params: {
    slotId: string;
    newConstraints: SlotConstraints;
  }): UpdateSlotConstraintsCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'UpdateSlotConstraints',
      sequence,
      ...params
    };
  }

  static publishStaged(): PublishStagedCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'PublishStaged',
      sequence
    };
  }

  static batchOperation(commands: AnyCommand[]): BatchOperationCommand {
    const sequence = sequenceAuthority.nextSequence();
    const commandId = CommandBuilder.generateId(sequence);
    sequenceAuthority.recordCommand(commandId, sequence);
    
    return {
      id: commandId,
      type: 'BatchOperation',
      sequence,
      commands
    };
  }
}

/**
 * Command Executor
 * Executes commands and produces events
 * Never mutates state directly - only produces events
 */
class CommandExecutor {
  private static instance: CommandExecutor;

  private constructor() {}

  static getInstance(): CommandExecutor {
    if (!CommandExecutor.instance) {
      CommandExecutor.instance = new CommandExecutor();
    }
    return CommandExecutor.instance;
  }

  /**
   * Execute a command and produce events
   * Constitutional Law 10: Commands Produce Events
   */
  async execute(command: AnyCommand): Promise<void> {
    if (command.type === 'BatchOperation') {
      await this.executeBatch(command);
    } else {
      // Produce corresponding event
      const event = await this.commandToEvent(command);
      
      // Emit event to event system
      const { eventSystem } = await import('./event-system');
      await eventSystem.emit(event);
    }
  }

  /**
   * Validate a command before execution
   * Returns deterministic ValidationResult instead of throwing
   */
  private async validateCommand(command: AnyCommand): Promise<ValidationResult> {
    const { slotRegistry } = await import('./slot-registry');
    const { placementGraph } = await import('./placement-graph');
    
    // Add validation logic based on command type
    switch (command.type) {
      case 'ReplaceAsset':
        // Validate asset exists, slot exists, etc.
        const slot = slotRegistry.getSlot(command.slotId);
        if (!slot) {
          return ValidationFailure.slotNotFound(command.slotId);
        }
        break;
      case 'MovePlacement':
        // Validate placement exists, target slot exists and is available
        const placement = placementGraph.getPlacement(command.placementId);
        if (!placement) {
          return ValidationFailure.placementNotFound(command.placementId);
        }
        const targetSlot = slotRegistry.getSlot(command.newSlotId);
        if (!targetSlot) {
          return ValidationFailure.targetSlotNotFound(command.newSlotId);
        }
        break;
      case 'DeletePlacement':
        // Validate placement exists
        const deletePlacement = placementGraph.getPlacement(command.placementId);
        if (!deletePlacement) {
          return ValidationFailure.placementNotFound(command.placementId);
        }
        break;
      default:
        // Default validation - no-op for now
        break;
    }
    
    return ValidationFailure.success();
  }

  /**
   * Execute batch operation with atomicity
   * Validates ALL commands before producing ANY events
   * Events are produced transactionally - all succeed or none succeed
   */
  private async executeBatch(command: BatchOperationCommand): Promise<void> {
    // Validate all commands first
    for (const cmd of command.commands) {
      const validationResult = await this.validateCommand(cmd);
      if (!validationResult.success) {
        // Validation failed - do not execute any commands
        throw new Error(`Batch validation failed: ${validationResult.code} - ${validationResult.message}`);
      }
    }

    // All validations passed - build all events
    const events: any[] = [];
    for (const cmd of command.commands) {
      const event = await this.commandToEvent(cmd);
      events.push(event);
    }

    // Append all events atomically to event store
    const { eventStore } = await import('./event-system');
    const appendResult = eventStore.appendAll(events);
    
    if (!appendResult.success) {
      throw new Error(`Batch append failed: ${appendResult.code} - ${appendResult.message}`);
    }

    // Notify listeners for all events
    const { eventBus } = await import('./event-system');
    for (const event of events) {
      await eventBus.emit(event);
    }
  }

  /**
   * Convert command to event
   * Events contain only forward-looking state (no old* fields)
   * Constitutional Law: Every command has exactly one event mapping
   * Constitutional Law: Command and event share same sequence for causal ordering
   */
  private async commandToEvent(command: AnyCommand): Promise<any> {
    // Lazy import to avoid circular dependency
    const { eventBuilder } = await import('./event-system');
    
    switch (command.type) {
      case 'ReplaceAsset':
        return eventBuilder.assetReplaced({
          commandId: command.id,
          commandSequence: command.sequence,
          slotId: command.slotId,
          newAssetId: command.newAssetId
        });
      case 'MovePlacement':
        return eventBuilder.placementMoved({
          commandId: command.id,
          commandSequence: command.sequence,
          placementId: command.placementId,
          newSlotId: command.newSlotId
        });
      case 'SwapPlacement':
        return eventBuilder.placementSwapped({
          commandId: command.id,
          commandSequence: command.sequence,
          placementId1: command.placementId1,
          placementId2: command.placementId2
        });
      case 'DeletePlacement':
        return eventBuilder.placementDeleted({
          commandId: command.id,
          commandSequence: command.sequence,
          placementId: command.placementId
        });
      case 'DuplicatePlacement':
        return eventBuilder.placementDuplicated({
          commandId: command.id,
          commandSequence: command.sequence,
          sourcePlacementId: command.sourcePlacementId,
          newPlacementId: command.newPlacementId,
          targetSlotId: command.targetSlotId
        });
      case 'CropAsset':
        return eventBuilder.assetCropped({
          commandId: command.id,
          commandSequence: command.sequence,
          assetId: command.assetId,
          newCrop: command.newCrop
        });
      case 'AdjustFocalPoint':
        return eventBuilder.focalPointAdjusted({
          commandId: command.id,
          commandSequence: command.sequence,
          assetId: command.assetId,
          newFocalPoint: command.newFocalPoint
        });
      case 'UpdateSlotConstraints':
        return eventBuilder.slotConstraintsUpdated({
          commandId: command.id,
          commandSequence: command.sequence,
          slotId: command.slotId,
          newConstraints: command.newConstraints
        });
      case 'PublishStaged':
        // Get current staged placements for proper event data
        const { placementGraph } = await import('./placement-graph');
        const stagedPlacements = placementGraph.getStagedPlacements();
        return eventBuilder.stagedPublished({
          commandId: command.id,
          commandSequence: command.sequence,
          placementIds: stagedPlacements.map(p => p.placementId)
        });
      case 'BatchOperation':
        // Batch commands don't directly produce events
        // They are validated and then each sub-command produces its own event
        throw new Error('BatchOperation must be executed via executeBatch, not commandToEvent');
      default:
        const _exhaustiveCheck: never = command;
        return _exhaustiveCheck;
    }
  }

  /**
   * Undo is a new command, not magical mutation
   * For event sourcing, undo creates new events
   * Returns false if undo cannot be safely performed
   */
  async undo(command: AnyCommand): Promise<boolean> {
    try {
      // Generate inverse command based on command type
      const inverseCommand = this.createInverseCommand(command);
      
      if (!inverseCommand) {
        return false;
      }
      
      // Execute the inverse command (produces new events)
      await this.execute(inverseCommand);
      return true;
    } catch (error) {
      console.error('Undo failed:', error);
      return false;
    }
  }

  /**
   * Redo is a new command, not magical mutation
   * Returns false if redo cannot be safely performed
   */
  async redo(command: AnyCommand): Promise<boolean> {
    try {
      // Redo is just re-executing the original command
      await this.execute(command);
      return true;
    } catch (error) {
      console.error('Redo failed:', error);
      return false;
    }
  }

  /**
   * Create inverse command for undo
   * This creates a new command that reverses the original
   * Returns null if inverse cannot be safely constructed
   */
  private createInverseCommand(command: AnyCommand): AnyCommand | null {
    switch (command.type) {
      case 'ReplaceAsset':
        // Need current asset ID from placement graph
        // This is a simplification - in production, we'd query the graph
        return null; // Cannot safely undo without current state
      case 'MovePlacement':
        // Move back to original slot
        // Would need to store original slot in command metadata
        return null; // Cannot safely undo without original slot
      case 'DeletePlacement':
        // Recreate placement (would need original placement data)
        return null; // Cannot safely undo without original placement data
      default:
        return null; // Undo not implemented for this command type
    }
  }
}

export const commandExecutor = CommandExecutor.getInstance();
export { CommandBuilder as commandBuilder };