import type {
  Covariance3x3,
  EoTrackId,
  GeometryClass,
  GeometryQuality,
  Position3D,
} from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// geometry.estimate.updated
// ---------------------------------------------------------------------------

/** Emitted when a geometry estimate is computed or refined. */
export interface GeometryEstimateUpdated extends EventEnvelope {
  eventType: 'geometry.estimate.updated';
  data: {
    estimateId: string;
    eoTrackIds: EoTrackId[];
    classification: GeometryClass;
    quality: GeometryQuality;
    position3D: Position3D | undefined;
    covariance3D: Covariance3x3 | undefined;
  };
}
