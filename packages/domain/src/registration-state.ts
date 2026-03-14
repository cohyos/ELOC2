import type { QualityLevel, SensorId, Timestamp } from './common-types.js';

// ---------------------------------------------------------------------------
// Bias models
// ---------------------------------------------------------------------------

/** Estimated spatial bias of a sensor. */
export interface SpatialBias {
  azimuthBiasDeg: number;
  elevationBiasDeg: number;
  rangeBiasM: number;
}

/** Estimated clock bias and drift of a sensor. */
export interface ClockBias {
  offsetMs: number;
  driftRateMs: number;
}

// ---------------------------------------------------------------------------
// Registration state
// ---------------------------------------------------------------------------

/**
 * The current registration (alignment) state for a sensor,
 * including spatial and timing bias estimates and quality indicators.
 */
export interface RegistrationState {
  sensorId: SensorId;
  spatialBias: SpatialBias;
  clockBias: ClockBias;
  spatialQuality: QualityLevel;
  timingQuality: QualityLevel;
  /** Age of the bias estimate in milliseconds. */
  biasEstimateAge: number;
  /** Whether the current registration is adequate for safe fusion. */
  fusionSafe: boolean;
  lastUpdated: Timestamp;
}
