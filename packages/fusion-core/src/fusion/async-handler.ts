import type {
  Covariance3x3,
  Position3D,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import {
  geodeticToENU,
  enuToGeodetic,
  mat3x3Add,
} from '@eloc2/shared-utils';

import type { FusionMode } from './fusion-mode-selector.js';
import { conservativeFuse } from './conservative-fuser.js';
import { centralizedFuse } from './centralized-fuser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsyncFusionResult {
  state: Position3D;
  covariance: Covariance3x3;
  confidence: number;
  lagMs: number;
  method: 'async_predict_update';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Process noise power (deg^2/s for geodetic, m^2/s for altitude). */
const PROCESS_NOISE_Q = 1e-6;

// ---------------------------------------------------------------------------
// asyncFuse
// ---------------------------------------------------------------------------

/**
 * Handle asynchronous / time-delayed measurements.
 *
 * 1. Compute lag between track time and observation time.
 * 2. Predict the track state forward or backward to the observation time
 *    using constant-velocity propagation in a local ENU frame.
 * 3. Grow the track covariance by adding process noise proportional to |lag|.
 * 4. Apply the appropriate fuser (conservative or centralized) based on
 *    the supplied fusionMode.
 */
export function asyncFuse(
  track: SystemTrack,
  observation: SourceObservation,
  fusionMode: FusionMode,
): AsyncFusionResult {
  const lagMs = (track.lastUpdated as number) - (observation.timestamp as number);
  const dtSeconds = -lagMs / 1000; // positive when we need to predict forward

  // Build a predicted track by propagating state
  const predictedTrack = predictTrack(track, dtSeconds);

  // Apply the appropriate fuser
  let fusedResult: { state: Position3D; covariance: Covariance3x3; confidence: number };

  if (fusionMode === 'conservative_track_fusion') {
    const r = conservativeFuse(predictedTrack, observation);
    fusedResult = r;
  } else if (fusionMode === 'centralized_measurement_fusion') {
    const r = centralizedFuse(predictedTrack, observation);
    fusedResult = r;
  } else {
    // confirmation_only: return track state unchanged with small confidence boost
    fusedResult = {
      state: { ...predictedTrack.state },
      covariance: predictedTrack.covariance.map((row) => [...row]) as Covariance3x3,
      confidence: Math.min(1, Math.max(0, predictedTrack.confidence + 0.01)),
    };
  }

  return {
    state: fusedResult.state,
    covariance: fusedResult.covariance,
    confidence: fusedResult.confidence,
    lagMs,
    method: 'async_predict_update',
  };
}

// ---------------------------------------------------------------------------
// Prediction helper
// ---------------------------------------------------------------------------

/**
 * Predict a track state forward (or backward) by dtSeconds using
 * constant-velocity propagation in a local ENU frame, and grow
 * covariance with process noise.
 */
function predictTrack(track: SystemTrack, dtSeconds: number): SystemTrack {
  const refLat = track.state.lat;
  const refLon = track.state.lon;
  const refAlt = track.state.alt;

  // Convert current state to ENU (will be [0,0,0] since it's the reference)
  let east = 0;
  let north = 0;
  let up = 0;

  // If track has velocity, propagate in ENU
  if (track.velocity && dtSeconds !== 0) {
    east += track.velocity.vx * dtSeconds;
    north += track.velocity.vy * dtSeconds;
    up += track.velocity.vz * dtSeconds;
  }

  // Convert predicted ENU back to geodetic
  const predicted = enuToGeodetic(east, north, up, refLat, refLon, refAlt);

  // Grow covariance: P_predicted = P_track + Q * |dt|
  const absDt = Math.abs(dtSeconds);
  const processNoise: Covariance3x3 = [
    [PROCESS_NOISE_Q * absDt, 0, 0],
    [0, PROCESS_NOISE_Q * absDt, 0],
    [0, 0, PROCESS_NOISE_Q * absDt],
  ];

  const grownCovariance = mat3x3Add(
    track.covariance,
    processNoise,
  ) as Covariance3x3;

  return {
    ...track,
    state: {
      lat: predicted.lat,
      lon: predicted.lon,
      alt: predicted.alt,
    },
    covariance: grownCovariance,
  };
}
