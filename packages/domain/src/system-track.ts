import type {
  Covariance3x3,
  Position3D,
  SensorId,
  SystemTrackId,
  Timestamp,
  Velocity3D,
  TargetClassification,
  ClassificationSource,
} from './common-types.js';
import type { DopplerQuality } from './source-track.js';
import type {
  TrackQuality,
  MotionModelStatus,
  ClassificationHypothesis,
} from './track-quality.js';

// ---------------------------------------------------------------------------
// Track status
// ---------------------------------------------------------------------------

/** Lifecycle status of a system-level fused track. */
export type TrackStatus = 'candidate' | 'tentative' | 'confirmed' | 'coasting' | 'dropped';

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
  /** Target classification (e.g. 'fighter_aircraft', 'uav', 'unknown'). */
  classification?: TargetClassification;
  /** Source that assigned the classification. */
  classificationSource?: ClassificationSource;
  /** Confidence in the classification, range [0, 1]. */
  classificationConfidence?: number;
  /** Latest fused radial velocity (m/s) from Doppler. Positive = receding, negative = approaching. */
  radialVelocity?: number;
  /** Doppler measurement quality from the last contributing radar. */
  dopplerQuality?: DopplerQuality;

  // --- Enhanced track quality fields ---

  /** Bayesian existence probability [0, 1]. */
  existenceProbability?: number;
  /** Comprehensive track quality assessment. */
  trackQuality?: TrackQuality;
  /** Active motion model from IMM filter. */
  motionModelStatus?: MotionModelStatus;
  /** Scheduled time for next sensor revisit. */
  plannedNextUpdateTime?: Timestamp;
  /** Local clutter density affecting this track [0, 1]. */
  sectorClutterLevel?: number;
  /** Multiple classification hypotheses with probabilities. */
  classificationHypotheses?: ClassificationHypothesis[];
  /** Local track IDs contributing to this system track. */
  contributingLocalTrackIds?: string[];
  /** Current fusion mode used for this track. */
  fusionMode?: string;
  /** Registration health status for this track's primary sensor. */
  registrationHealth?: string;
}
