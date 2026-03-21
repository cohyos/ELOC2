import type {
  Covariance3x3,
  Position3D,
  SensorId,
  SourceTrackId,
  Timestamp,
  Velocity3D,
} from './common-types.js';
import type { DetectionQualityFlags, BeamMetadata } from './track-quality.js';

// ---------------------------------------------------------------------------
// Source observation
// ---------------------------------------------------------------------------

/** The sensor frame / modality that produced the observation. */
export type SensorFrame = 'radar' | 'eo' | 'c4isr';

/** Doppler measurement quality indicator. */
export type DopplerQuality = 'high' | 'medium' | 'low' | 'blind';

/** A single positional observation reported by a sensor. */
export interface SourceObservation {
  observationId: string;
  sensorId: SensorId;
  timestamp: Timestamp;
  position: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  sensorFrame: SensorFrame;
  /** Radial velocity (m/s) from Doppler measurement. Positive = receding, negative = approaching. Radar-only. */
  radialVelocity?: number;
  /** Doppler measurement quality. Radar-only. */
  dopplerQuality?: DopplerQuality;

  // --- Enhanced detection metadata ---

  /** Sensor operating mode that produced this observation. */
  sensorMode?: string;
  /** Type of measurement. */
  measurementType?: 'position' | 'bearing_only' | 'doppler_only';
  /** Signal-to-noise ratio in dB. */
  snr?: number;
  /** Raw signal amplitude. */
  amplitude?: number;
  /** Detection quality indicators. */
  qualityFlags?: DetectionQualityFlags;
  /** Radar beam / dwell metadata. */
  beamMetadata?: BeamMetadata;
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
