import { randomUUID } from 'node:crypto';
import type { EventId, Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

/** Provenance metadata — which agent / service emitted the event. */
export interface EventProvenance {
  source: string;
  agentId?: string;
}

/**
 * Common envelope that wraps every domain event.
 * Every concrete event type extends this interface.
 */
export interface EventEnvelope {
  eventId: EventId;
  eventType: string;
  timestamp: Timestamp;
  provenance: EventProvenance;
  /** References to upstream entities or events that contributed to this event. */
  sourceReferences: string[];
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Creates a minimal event envelope with a generated UUID and the current
 * timestamp.  Callers should spread this into their concrete event objects.
 *
 * @param eventType - Dotted event type string (e.g. "source.observation.reported").
 * @param source    - The service or agent that produced the event.
 * @param agentId   - Optional identifier of the specific agent instance.
 */
export function createEventEnvelope(
  eventType: string,
  source: string,
  agentId?: string,
): EventEnvelope {
  return {
    eventId: randomUUID() as EventId,
    eventType,
    timestamp: Date.now() as Timestamp,
    provenance: { source, agentId },
    sourceReferences: [],
  };
}
