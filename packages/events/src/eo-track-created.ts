import type { EoTrack } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// eo.track.created
// ---------------------------------------------------------------------------

/** Emitted when a new EO track is created from sensor observations. */
export interface EoTrackCreated extends EventEnvelope {
  eventType: 'eo.track.created';
  data: {
    eoTrack: EoTrack;
  };
}
