import type { LocalTrack } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// local.track.updated
// ---------------------------------------------------------------------------

/** Emitted when a sensor-local track is created or updated. */
export interface LocalTrackUpdated extends EventEnvelope {
  eventType: 'local.track.updated';
  data: {
    localTrack: LocalTrack;
  };
}
