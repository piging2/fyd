/**
 * HPP Event Logger
 *
 * Event logging system for marketing and customer interactions.
 * Events are captured here for future analysis by PING.
 *
 * Uses EventRepository abstraction for storage.
 * Currently uses in-memory repository (MVP) - will migrate to SQLite.
 *
 * WARNING: In-memory storage is NOT durable. Events are lost on:
 * - Server restart
 * - Deployment
 * - Multiple server instances
 * - Lambda cold starts
 *
 * Production requires SQLite or Postgres repository.
 */

import type { HPPEvent, HPPEventType, HPPMetadata } from "@/types/events";
import { SCHEMA_VERSION } from "@/types/events";

/**
 * Event Provenance
 *
 * Tracks external event sources for idempotency.
 * Prevents duplicate events from Kit webhooks, Google retries, browser retries.
 */
export interface EventProvenance {
  provider: string; // 'kit', 'google', 'manual', 'form'
  eventType: string;
  providerObjectId?: string; // Kit subscriber ID, Google review ID, etc.
}

/**
 * ReplayRepository Interface
 *
 * For PING and replay systems.
 * Exposes only append and cursor-based iteration.
 * No query methods - replay systems should not depend on queries.
 */
export interface ReplayRepository {
  /**
   * Append a single event
   * Returns false if event already exists (idempotency)
   */
  append(event: HPPEvent, provenance?: EventProvenance): Promise<boolean>;

  /**
   * Append multiple events (best-effort, not atomic)
   * Returns count of events actually appended (skips duplicates)
   *
   * NOTE: Not atomic - if event #3 fails, events 1-2 are committed.
   * SQLite implementation will use transactions for true atomicity.
   */
  appendMany(events: HPPEvent[], provenances?: EventProvenance[]): Promise<number>;

  /**
   * Find event by ID
   */
  findById(id: string): Promise<HPPEvent | null>;

  /**
   * Find events after a cursor (for replay systems)
   * Cursor can be an event ID, timestamp, or sequence number
   * Uses WHERE cursor > ... semantics, not array indexing
   */
  findAfter(cursor: string): Promise<HPPEvent[]>;

  /**
   * Check if event already exists (for idempotency)
   */
  exists(id: string): Promise<boolean>;

  /**
   * Check if provenance already exists (for external idempotency)
   */
  existsByProvenance(provenance: EventProvenance): Promise<boolean>;
}

/**
 * WebsiteRepository Interface
 *
 * For website queries and admin functions.
 * Exposes query methods for finding events by type, email, etc.
 */
export interface WebsiteRepository {
  /**
   * Find events by type
   */
  findByType(type: HPPEventType): Promise<HPPEvent[]>;

  /**
   * Find events by email
   */
  findByEmail(email: string): Promise<HPPEvent[]>;

  /**
   * Find all events
   */
  findAll(): Promise<HPPEvent[]>;
}

/**
 * EventRepository Interface
 *
 * Combined interface for backward compatibility.
 * Implements both ReplayRepository and WebsiteRepository.
 *
 * TODO: Eventually split into separate ReplayRepository and WebsiteRepository implementations.
 */
export interface EventRepository extends ReplayRepository, WebsiteRepository {}

/**
 * InMemoryEventRepository
 *
 * WARNING: NOT SUITABLE FOR PRODUCTION
 * Events are lost on server restart, deployment, and scaling.
 * Use only for development/testing.
 */
class InMemoryEventRepository implements EventRepository {
  private events: HPPEvent[] = [];
  private provenances: EventProvenance[] = [];

  async append(event: HPPEvent, provenance?: EventProvenance): Promise<boolean> {
    // Idempotency check by event ID
    if (await this.exists(event.id)) {
      return false;
    }

    // Idempotency check by provenance
    if (provenance && await this.existsByProvenance(provenance)) {
      return false;
    }

    this.events.push(event);
    if (provenance) {
      this.provenances.push(provenance);
    }
    return true;
  }

  async appendMany(events: HPPEvent[], provenances?: EventProvenance[]): Promise<number> {
    let appendedCount = 0;
    for (let i = 0; i < events.length; i++) {
      const provenance = provenances?.[i];
      const appended = await this.append(events[i], provenance);
      if (appended) {
        appendedCount++;
      }
    }
    return appendedCount;
  }

  async findById(id: string): Promise<HPPEvent | null> {
    return this.events.find(e => e.id === id) || null;
  }

  async findAfter(cursor: string): Promise<HPPEvent[]> {
    // For in-memory, treat cursor as event ID
    // In SQLite, this would be WHERE id > cursor ORDER BY id
    const cursorIndex = this.events.findIndex(e => e.id === cursor);
    if (cursorIndex === -1) {
      return [...this.events];
    }
    return this.events.slice(cursorIndex + 1);
  }

  async findByType(type: HPPEventType): Promise<HPPEvent[]> {
    return this.events.filter(e => e.type === type);
  }

  async findByEmail(email: string): Promise<HPPEvent[]> {
    return this.events.filter(e => {
      const emailValue = e.data.email;
      return typeof emailValue === 'string' && emailValue === email;
    });
  }

  async findAll(): Promise<HPPEvent[]> {
    return [...this.events];
  }

  async exists(id: string): Promise<boolean> {
    return this.events.some(e => e.id === id);
  }

  async existsByProvenance(provenance: EventProvenance): Promise<boolean> {
    return this.provenances.some(p =>
      p.provider === provenance.provider &&
      p.eventType === provenance.eventType &&
      p.providerObjectId === provenance.providerObjectId
    );
  }
}

/**
 * Current repository instance
 * TODO: Swap with SQLiteEventRepository when npm install is available
 */
let repository: EventRepository = new InMemoryEventRepository();

/**
 * Set the event repository (for testing or swapping implementations)
 */
export function setEventRepository(repo: EventRepository): void {
  repository = repo;
}

/**
 * Get the current event repository
 */
export function getEventRepository(): EventRepository {
  return repository;
}

/**
 * Generate UUID v4
 *
 * Standards-compliant UUID v4 implementation using crypto.randomUUID().
 * Replaces pseudo-UUIDv7 implementation which was not RFC 9562 compliant.
 *
 * TODO: When npm install is available, replace with UUIDv7 library for chronological ordering.
 * Recommended: npm install uuidv7
 *
 * For now, UUID v4 is safe and standards-compliant.
 * PING can handle replay ordering via sequence numbers instead of UUID ordering.
 */
function generateUUIDv4(): string {
  return crypto.randomUUID();
}

/**
 * Log an HPP event
 *
 * @param type - Event type
 * @param data - Event data
 * @param metadata - Event metadata
 * @param occurredAt - When the event actually happened (business time). Defaults to now for synchronous events.
 */
export async function logEvent(
  type: HPPEventType,
  data: Record<string, unknown>,
  metadata?: HPPMetadata,
  occurredAt?: string
): Promise<HPPEvent> {
  const receivedAt = new Date().toISOString();
  const event: HPPEvent = {
    schemaVersion: SCHEMA_VERSION,
    id: generateUUIDv4(),
    type,
    timestamp: occurredAt || receivedAt, // occurredAt - when the business event happened
    receivedAt, // when HPP received the event
    data,
    metadata,
  };

  await repository.append(event);

  // Log only non-PII information to console
  console.info(`[HPP Event] ${type} id=${event.id}`);

  return event;
}

/**
 * Get events by type
 */
export async function getEventsByType(type: HPPEventType): Promise<HPPEvent[]> {
  return await repository.findByType(type);
}

/**
 * Get events for a specific email
 */
export async function getEventsByEmail(email: string): Promise<HPPEvent[]> {
  return await repository.findByEmail(email);
}

/**
 * Get all events (for debugging/admin)
 */
export async function getAllEvents(): Promise<HPPEvent[]> {
  return await repository.findAll();
}
