import type { TargetClassification } from './common-types.js';

// ---------------------------------------------------------------------------
// Detection quality flags
// ---------------------------------------------------------------------------

/** Quality indicators attached to a single sensor detection. */
export interface DetectionQualityFlags {
  /** Observation may be contaminated by ground or weather clutter. */
  clutterContaminated: boolean;
  /** Electronic counter-measures detected during this observation. */
  ecmDetected: boolean;
  /** Multipath propagation suspected. */
  multipath: boolean;
  /** Signal-to-noise ratio below nominal threshold. */
  lowSnr: boolean;
}

// ---------------------------------------------------------------------------
// Beam metadata
// ---------------------------------------------------------------------------

/** Radar beam / dwell metadata associated with an observation. */
export interface BeamMetadata {
  /** Identifier for the beam or dwell that produced this detection. */
  beamId?: string;
  /** Dwell time in milliseconds. */
  dwellTimeMs?: number;
  /** Number of pulses integrated. */
  pulseCount?: number;
}

// ---------------------------------------------------------------------------
// Motion model status
// ---------------------------------------------------------------------------

/**
 * Indicates which kinematic motion model best describes the target's
 * current behaviour, as determined by the IMM filter.
 */
export type MotionModelStatus =
  | 'constant_velocity'
  | 'coordinated_turn'
  | 'ballistic'
  | 'unknown';

// ---------------------------------------------------------------------------
// Track quality
// ---------------------------------------------------------------------------

/** Comprehensive quality assessment for a system track. */
export interface TrackQuality {
  /** Bayesian existence probability in [0, 1]. */
  existenceProbability: number;
  /** How well the current motion model fits observed kinematics [0, 1]. */
  kinematicConfidence: number;
  /** Seconds since the last high-quality (non-degraded) update. */
  lastReliableUpdateAge: number;
  /** Number of supporting updates in the rolling observation window. */
  rollingSupportCount: number;
  /** Number of distinct sensor sources that have contributed. */
  sourceDiversity: number;
  /** Confidence in the currently active IMM model [0, 1]. */
  motionModelConfidence: number;
  /** Local clutter density stress factor [0, 1]. 0 = no clutter. */
  sectorClutterStress: number;
}

// ---------------------------------------------------------------------------
// Classification hypothesis
// ---------------------------------------------------------------------------

/** A single classification hypothesis with its probability. */
export interface ClassificationHypothesis {
  label: TargetClassification;
  probability: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a default TrackQuality with conservative initial values. */
export function createDefaultTrackQuality(): TrackQuality {
  return {
    existenceProbability: 0.3,
    kinematicConfidence: 0.5,
    lastReliableUpdateAge: 0,
    rollingSupportCount: 1,
    sourceDiversity: 1,
    motionModelConfidence: 0.5,
    sectorClutterStress: 0,
  };
}
