/**
 * Sequence Authority
 * 
 * Constitutional Law: One Canonical Sequencing Model
 * 
 * Command and event sequence ownership must be reconciled into one canonical model.
 * This ensures command/event causality is represented by a single canonical sequence.
 * 
 * The sequence authority:
 * - Generates all sequence numbers for commands and events
 * - Ensures strictly increasing sequences
 * - Prevents duplicate sequences
 * - Provides deterministic replay
 */

class SequenceAuthority {
  private static instance: SequenceAuthority;
  private sequence = 0;
  private commandSequences = new Map<string, number>();
  private eventSequences = new Map<string, number>();

  private constructor() {}

  static getInstance(): SequenceAuthority {
    if (!SequenceAuthority.instance) {
      SequenceAuthority.instance = new SequenceAuthority();
    }
    return SequenceAuthority.instance;
  }

  /**
   * Get next sequence number
   * This is the only way to generate sequences in the system
   */
  nextSequence(): number {
    return ++this.sequence;
  }

  /**
   * Get current sequence (without incrementing)
   */
  getCurrentSequence(): number {
    return this.sequence;
  }

  /**
   * Reset sequence (for testing only)
   */
  reset(): void {
    this.sequence = 0;
    this.commandSequences.clear();
    this.eventSequences.clear();
  }

  /**
   * Record command sequence for tracking
   */
  recordCommand(commandId: string, sequence: number): void {
    this.commandSequences.set(commandId, sequence);
  }

  /**
   * Record event sequence for tracking
   */
  recordEvent(eventId: string, sequence: number): void {
    this.eventSequences.set(eventId, sequence);
  }

  /**
   * Get command sequence
   */
  getCommandSequence(commandId: string): number | undefined {
    return this.commandSequences.get(commandId);
  }

  /**
   * Get event sequence
   */
  getEventSequence(eventId: string): number | undefined {
    return this.eventSequences.get(eventId);
  }

  /**
   * Validate sequence monotonicity
   * Ensures sequences are strictly increasing
   */
  validateSequence(current: number): boolean {
    return current > this.sequence;
  }

  /**
   * Validate no duplicate sequences
   */
  validateNoDuplicate(sequence: number): boolean {
    return !Array.from(this.commandSequences.values()).includes(sequence) &&
           !Array.from(this.eventSequences.values()).includes(sequence);
  }

  /**
   * Validate event ID ↔ sequence consistency
   */
  validateEventIdSequence(eventId: string, sequence: number): boolean {
    const expectedId = `evt_${sequence}`;
    return eventId === expectedId;
  }

  /**
   * Validate command ID uniqueness
   */
  validateCommandIdUnique(commandId: string): boolean {
    return !this.commandSequences.has(commandId);
  }
}

export const sequenceAuthority = SequenceAuthority.getInstance();
