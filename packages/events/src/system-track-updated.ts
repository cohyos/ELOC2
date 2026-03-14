import type { Position3D, SensorId, SystemTrackId } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// system.track.updated
// ---------------------------------------------------------------------------

/** Emitted when a system-level fused track is created or updated. */
export interface SystemTrackUpdated extends EventEnvelope {
  eventType: 'system.track.updated';
  data: {
    systemTrackId: SystemTrackId;
    previousState: Position3D;
    newState: Position3D;
    fusionMethod: string;
    sourcesUsed: SensorId[];
    confidenceChange: number;
  };
}
