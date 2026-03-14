import type { SourceObservation } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// source.observation.reported
// ---------------------------------------------------------------------------

/** Emitted when a sensor reports a new positional observation. */
export interface SourceObservationReported extends EventEnvelope {
  eventType: 'source.observation.reported';
  data: {
    observation: SourceObservation;
  };
}
