/**
 * PING API Seam (Adapter Interface)
 *
 * This file is a boundary, not a backend. It defines the interface the
 * website would use to talk to the PING intelligence system, and ships a
 * clearly labeled UNCONNECTED implementation.
 *
 * Data flow (when connected):
 *
 *   PING Website
 *       |
 *       v
 *   PING API (this adapter)
 *       |
 *       v
 *   existing PING authorities
 *   (identity, events, missions, execution, artifacts, model routing,
 *    agent registry)
 *
 * The website consumes these authorities. It never owns or duplicates them.
 * Do not add endpoint URLs, credentials, or client secrets here. Connection
 * configuration belongs to deployment, not to source code.
 */

// ---------------------------------------------------------------------------
// Domain types (shaped by PING's event and knowledge model)
// ---------------------------------------------------------------------------

export interface Observation {
  id: string;
  statement: string;
  source: string;
  confidence: "confirmed" | "strong" | "weak" | "unknown";
  observedAt: string;
}

export interface KnowledgeResult {
  answer: string;
  evidence: Observation[];
  verification: "verified" | "partial" | "unverified";
}

export interface ContactSubmission {
  name: string;
  business?: string;
  email?: string;
  phone?: string;
  message: string;
}

export interface ContactReceipt {
  received: boolean;
  reference: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface PingApi {
  /**
   * Fetch recent observations relevant to a topic.
   * Maps to PING's observation authority; read-only.
   */
  getObservations(topic: string, limit?: number): Promise<Observation[]>;

  /**
   * Query PING's canonical knowledge with evidence attached.
   * Maps to PING's knowledge authority; read-only.
   */
  queryKnowledge(question: string): Promise<KnowledgeResult>;

  /**
   * Submit a contact request. The website records the submission and hands
   * it to PING's mission/intake pipeline; it does not process it here.
   */
  submitContact(submission: ContactSubmission): Promise<ContactReceipt>;
}

// ---------------------------------------------------------------------------
// UNCONNECTED implementation
//
// Every method throws UnconnectedError. Nothing here talks to a network,
// reads a secret, or fabricates data. When a real PING API exists, replace
// this export with an implementation of PingApi backed by it. Nothing else
// in the website should change.
// ---------------------------------------------------------------------------

export class UnconnectedError extends Error {
  constructor(method: string) {
    super(
      `PING API seam: ${method} is not connected. ` +
        `The website ships with an unconnected adapter by design; ` +
        `no data was sent and no data was fabricated.`,
    );
    this.name = "UnconnectedError";
  }
}

class UnconnectedPingApi implements PingApi {
  async getObservations(_topic: string, _limit?: number): Promise<Observation[]> {
    throw new UnconnectedError("getObservations");
  }

  async queryKnowledge(_question: string): Promise<KnowledgeResult> {
    throw new UnconnectedError("queryKnowledge");
  }

  async submitContact(_submission: ContactSubmission): Promise<ContactReceipt> {
    throw new UnconnectedError("submitContact");
  }
}

/**
 * The website's PING API handle. Swap UnconnectedPingApi for a real
 * implementation when the PING API is available. Callers must handle
 * UnconnectedError where live data is optional.
 */
export const pingApi: PingApi = new UnconnectedPingApi();

export function isPingApiConnected(): boolean {
  return !(pingApi instanceof UnconnectedPingApi);
}
