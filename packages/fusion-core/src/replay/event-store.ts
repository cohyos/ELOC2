import type { Timestamp } from '@eloc2/domain';
import type { EventEnvelope } from '@eloc2/events';

// ---------------------------------------------------------------------------
// EventStore
// ---------------------------------------------------------------------------

/**
 * Append-only in-memory event store for replay and audit.
 *
 * Stores all domain events emitted during a simulation run and provides
 * time-window, track-id, and event-type query facilities.
 */
export class EventStore {
  private readonly events: EventEnvelope[] = [];

  /** Append an event to the store. */
  append(event: EventEnvelope): void {
    this.events.push(event);
  }

  /** Return all stored events in insertion order. */
  getAll(): EventEnvelope[] {
    return [...this.events];
  }

  /** Return events whose timestamp falls within [start, end] (inclusive). */
  queryByTimeWindow(start: Timestamp, end: Timestamp): EventEnvelope[] {
    return this.events.filter(
      (e) => e.timestamp >= start && e.timestamp <= end,
    );
  }

  /**
   * Return events that reference the given track ID in their
   * sourceReferences array.
   */
  queryByTrackId(trackId: string): EventEnvelope[] {
    return this.events.filter((e) =>
      e.sourceReferences.includes(trackId),
    );
  }

  /** Return events matching the given eventType string. */
  queryByType(eventType: string): EventEnvelope[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  /** Remove all stored events. */
  clear(): void {
    this.events.length = 0;
  }

  /** Number of stored events. */
  size(): number {
    return this.events.length;
  }
}
