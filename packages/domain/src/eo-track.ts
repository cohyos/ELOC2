import type {
  BearingMeasurement,
  CueId,
  EoTrackId,
  SensorId,
  SystemTrackId,
  Timestamp,
} from './common-types.js';
import type { TrackLineageEntry } from './system-track.js';

// ---------------------------------------------------------------------------
// EO track status
// ---------------------------------------------------------------------------

/** Lifecycle status of an EO-originated track. */
export type EoTrackStatus =
  | 'tentative'
  | 'confirmed'
  | 'unresolved'
  | 'split'
  | 'dropped';

// ---------------------------------------------------------------------------
// EO track
// ---------------------------------------------------------------------------

/** Identification support data provided by the EO sensor. */
export interface IdentificationSupport {
  type: string;
  confidence: number;
  features: string[];
}

/**
 * A track derived from electro-optical sensor observations.
 * Always linked back to the cue that initiated the observation.
 */
export interface EoTrack {
  eoTrackId: EoTrackId;
  parentCueId: CueId;
  sensorId: SensorId;
  bearing: BearingMeasurement;
  /** Image quality score in the range [0, 1]. */
  imageQuality: number;
  identificationSupport: IdentificationSupport | undefined;
  status: EoTrackStatus;
  lineage: TrackLineageEntry[];
  associatedSystemTrackId: SystemTrackId | undefined;
  /** Confidence score in the range [0, 1]. */
  confidence: number;
  lastUpdated: Timestamp;
}
