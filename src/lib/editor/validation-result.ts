/**
 * Validation Result
 * 
 * Constitutional Law: Deterministic Failure Envelopes
 * 
 * Runtime validation failures must use deterministic failure codes
 * rather than runtime-dependent Error messages.
 * This ensures replay determinism.
 */

export type ValidationCode =
  | 'SLOT_NOT_FOUND'
  | 'PLACEMENT_NOT_FOUND'
  | 'TARGET_SLOT_NOT_FOUND'
  | 'SLOT_ALREADY_OCCUPIED'
  | 'INVALID_COMMAND_TYPE'
  | 'DUPLICATE_COMMAND_ID'
  | 'SEQUENCE_VIOLATION'
  | 'EVENT_ID_MISMATCH'
  | 'UNKNOWN_ERROR';

export interface ValidationResult {
  success: boolean;
  code?: ValidationCode;
  message?: string;
}

export class ValidationFailure {
  static slotNotFound(slotId: string): ValidationResult {
    return {
      success: false,
      code: 'SLOT_NOT_FOUND',
      message: `Slot ${slotId} does not exist`
    };
  }

  static placementNotFound(placementId: string): ValidationResult {
    return {
      success: false,
      code: 'PLACEMENT_NOT_FOUND',
      message: `Placement ${placementId} does not exist`
    };
  }

  static targetSlotNotFound(slotId: string): ValidationResult {
    return {
      success: false,
      code: 'TARGET_SLOT_NOT_FOUND',
      message: `Target slot ${slotId} does not exist`
    };
  }

  static slotAlreadyOccupied(slotId: string): ValidationResult {
    return {
      success: false,
      code: 'SLOT_ALREADY_OCCUPIED',
      message: `Slot ${slotId} already has an active placement`
    };
  }

  static invalidCommandType(type: string): ValidationResult {
    return {
      success: false,
      code: 'INVALID_COMMAND_TYPE',
      message: `Invalid command type: ${type}`
    };
  }

  static duplicateCommandId(commandId: string): ValidationResult {
    return {
      success: false,
      code: 'DUPLICATE_COMMAND_ID',
      message: `Command ID ${commandId} already exists`
    };
  }

  static sequenceViolation(sequence: number): ValidationResult {
    return {
      success: false,
      code: 'SEQUENCE_VIOLATION',
      message: `Sequence ${sequence} violates monotonicity`
    };
  }

  static eventIdMismatch(eventId: string, sequence: number): ValidationResult {
    return {
      success: false,
      code: 'EVENT_ID_MISMATCH',
      message: `Event ID ${eventId} does not match sequence ${sequence}`
    };
  }

  static unknownError(message: string): ValidationResult {
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message
    };
  }

  static success(): ValidationResult {
    return { success: true };
  }
}
