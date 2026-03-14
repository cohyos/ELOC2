import type {
  Covariance3x3,
  Position3D,
  SensorId,
  SourceTrackId,
  Timestamp,
  Velocity3D,
} from './common-types.js';

// ---------------------------------------------------------------------------
// Source observation
// ---------------------------------------------------------------------------

/** The sensor frame / modality that produced the observation. */
export type SensorFrame = 'radar' | 'eo' | 'c4isr';

/** A single positional observation reported by a sensor. */
export interface SourceObservation {
  observationId: string;
  sensorId: SensorId;
  timestamp: Timestamp;
  position: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  sensorFrame: SensorFrame;
}

// ---------------------------------------------------------------------------
// Local (source) track
// ---------------------------------------------------------------------------

/** Lifecycle status of a sensor-local track. */
export type LocalTrackStatus = 'active' | 'stale' | 'dropped';

/**
 * A track maintained locally by a single sensor before correlation
 * and fusion into the system-level picture.
 */
export interface LocalTrack {
  localTrackId: SourceTrackId;
  sensorId: SensorId;
  observations: SourceObservation[];
  state: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  lastUpdated: Timestamp;
  status: LocalTrackStatus;
}
