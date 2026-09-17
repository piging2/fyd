/**
 * Durable Event Store
 * 
 * Constitutional Law: Event Store Must Be Durable
 * 
 * The event store must persist events to storage for replay sovereignty.
 * This implementation uses in-memory storage for now (localStorage is not suitable as constitutional boundary).
 * 
 * Events are:
 * - Appended transactionally
 * - Deep-frozen to prevent mutation
 * - Validated against canonical schema
 * - Enforced for sequence monotonicity
 */

import { AnyEvent, Event } from './event-system';
import { sequenceAuthority } from './sequence-authority';
import { ValidationFailure, ValidationResult } from './validation-result';

interface PersistedEventStore {
  events: Event[];
  version: number;
  lastSequence: number;
}

class DurableEventStore {
  private static instance: DurableEventStore;
  private events: Event[] = [];
  private version = 0;
  private lastSequence = 0;

  private constructor() {
    // No persistence loading - in-memory only for now
    // localStorage is not suitable as constitutional durability boundary
  }

  static getInstance(): DurableEventStore {
    if (!DurableEventStore.instance) {
      DurableEventStore.instance = new DurableEventStore();
    }
    return DurableEventStore.instance;
  }

  /**
   * Deep freeze an event to prevent mutation
   */
  private deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Freeze primitive properties
    Object.freeze(obj);

    // Recursively freeze nested objects
    for (const key of Object.keys(obj)) {
      const value = (obj as any)[key];
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        this.deepFreeze(value);
      }
    }

    return obj;
  }

  /**
   * Validate event against canonical schema
   */
  private validateEvent(event: Event): boolean {
    // Ensure event has required fields
    if (!event.id || !event.type || !event.sequence || !event.commandId) {
      return false;
    }

    // Validate event ID matches sequence
    const expectedId = `evt_${event.sequence}`;
    if (event.id !== expectedId) {
      return false;
    }

    return true;
  }

  /**
   * Validate complete candidate sequence list for batch operation
   * Ensures e1.sequence <= e2.sequence <= ... <= en.sequence (allowing equality for command/event pairs)
   * Also validates no duplicates within the same sequence
   */
  private validateCandidateSequence(events: Event[]): boolean {
    const seenEventIds = new Set<string>();
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Validate individual event
      if (!this.validateEvent(event)) {
        return false;
      }

      // Validate monotonicity (non-decreasing, allowing equality for command/event pairs)
      if (i > 0 && event.sequence < events[i - 1].sequence) {
        return false;
      }

      // Validate no duplicate event IDs within the same sequence
      if (seenEventIds.has(event.id)) {
        return false;
      }
      seenEventIds.add(event.id);
    }

    return true;
  }

  /**
   * Append a single event
   * Enforces canonical schema and sequence invariants
   * Returns ValidationResult instead of throwing
   */
  append(event: Event): ValidationResult {
    // Validate sequence monotonicity against last sequence
    if (event.sequence <= this.lastSequence) {
      return ValidationFailure.sequenceViolation(event.sequence);
    }

    if (!this.validateEvent(event)) {
      return ValidationFailure.unknownError('Event validation failed');
    }

    // Deep freeze to prevent mutation
    const frozenEvent = this.deepFreeze(event);
    
    this.events.push(frozenEvent);
    this.lastSequence = event.sequence;
    this.version++;
    
    return ValidationFailure.success();
  }

  /**
   * Append multiple events atomically
   * All events must validate before any are persisted
   * Validates complete candidate sequence list
   * Returns ValidationResult instead of throwing
   */
  appendAll(events: Event[]): ValidationResult {
    // Validate the complete candidate sequence list
    if (!this.validateCandidateSequence(events)) {
      return ValidationFailure.unknownError('Candidate sequence validation failed');
    }

    // Deep freeze all events
    const frozenEvents = events.map(e => this.deepFreeze(e));
    
    // Append all events
    this.events.push(...frozenEvents);
    
    // Update last sequence to the highest sequence
    const maxSequence = Math.max(...events.map(e => e.sequence));
    this.lastSequence = maxSequence;
    this.version++;
    
    return ValidationFailure.success();
  }

  /**
   * Get all events
   * Returns deep copies to prevent mutation
   */
  getAll(): Event[] {
    return this.events.map(e => JSON.parse(JSON.stringify(e)));
  }

  /**
   * Get events from sequence
   * Returns deep copies to prevent mutation
   */
  getFromSequence(fromSequence: number): Event[] {
    return this.events
      .filter(e => e.sequence >= fromSequence)
      .map(e => JSON.parse(JSON.stringify(e)));
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.version = 0;
    this.lastSequence = 0;
  }

  /**
   * Get current version
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get last sequence number
   */
  getLastSequence(): number {
    return this.lastSequence;
  }
}

export const durableEventStore = DurableEventStore.getInstance();
