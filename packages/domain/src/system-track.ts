import type {
  Covariance3x3,
  Position3D,
  SensorId,
  SystemTrackId,
  Timestamp,
  Velocity3D,
} from './common-types.js';

// ---------------------------------------------------------------------------
// Track status
// ---------------------------------------------------------------------------

/** Lifecycle status of a system-level fused track. */
export type TrackStatus = 'tentative' | 'confirmed' | 'dropped';

// ---------------------------------------------------------------------------
// Track lineage
// ---------------------------------------------------------------------------

/** A single entry in the immutable lineage chain of a track. */
export interface TrackLineageEntry {
  version: number;
  event: string;
  timestamp: Timestamp;
  parentTrackIds: SystemTrackId[];
  description: string;
}

// ---------------------------------------------------------------------------
// EO investigation status
// ---------------------------------------------------------------------------

/** Status of the EO investigation associated with this system track. */
export type EoInvestigationStatus =
  | 'pending'
  | 'in_progress'
  | 'confirmed'
  | 'no_support'
  | 'split_detected'
  | 'none';

// ---------------------------------------------------------------------------
// System track
// ---------------------------------------------------------------------------

/**
 * A fused system-level track produced by the correlation / fusion pipeline.
 * Aggregates observations from one or more sensors and maintains full lineage.
 */
export interface SystemTrack {
  systemTrackId: SystemTrackId;
  state: Position3D;
  velocity: Velocity3D | undefined;
  covariance: Covariance3x3;
  /** Fused confidence score in the range [0, 1]. */
  confidence: number;
  status: TrackStatus;
  lineage: TrackLineageEntry[];
  lastUpdated: Timestamp;
  /** Sensors that have contributed observations to this track. */
  sources: SensorId[];
  eoInvestigationStatus: EoInvestigationStatus;
}
