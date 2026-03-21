/**
 * JPDA weighted Kalman update.
 *
 * Given the beta coefficients and observations for a track, computes the
 * combined innovation and spread-of-means covariance correction.
 */

import type {
  Covariance3x3,
  Position3D,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import {
  mat3x3Add,
  mat3x3Inverse,
  normalizeLon,
} from '@eloc2/shared-utils';
import type { FusedState } from '../fusion/fuser.js';
import type { BetaCoefficients } from './jpda-associator.js';

// ---------------------------------------------------------------------------
// JPDA Update
// ---------------------------------------------------------------------------

/**
 * Perform JPDA weighted update on a track.
 *
 * @param track         The track to update.
 * @param betas         Beta coefficients (association probabilities).
 * @param observations  All observations in the cluster (indexed by observationIndex).
 * @returns A FusedState compatible with TrackManager.updateTrack().
 */
export function jpdaUpdate(
  track: SystemTrack,
  betas: BetaCoefficients,
  observations: SourceObservation[],
): FusedState {
  // Beta for missed detection
  const betaMiss = betas.betas.get(-1) ?? 0;

  // If no observations are associated (beta_miss ≈ 1), return track unchanged
  if (betaMiss > 0.999) {
    return {
      state: { ...track.state },
      covariance: track.covariance.map(row => [...row]) as Covariance3x3,
      confidence: Math.max(0, track.confidence - 0.02), // slight confidence decay
      radialVelocity: track.radialVelocity,
      dopplerQuality: track.dopplerQuality,
    };
  }

  // Compute the combined (weighted) innovation
  let combinedLat = 0;
  let combinedLon = 0;
  let combinedAlt = 0;
  let totalBetaObs = 0;

  // Also track best observation for Doppler propagation
  let bestBeta = 0;
  let bestObs: SourceObservation | undefined;

  for (const [oi, beta] of betas.betas) {
    if (oi < 0) continue; // skip missed-detection
    if (oi >= observations.length) continue;

    const obs = observations[oi];
    combinedLat += beta * obs.position.lat;
    combinedLon += beta * obs.position.lon;
    combinedAlt += beta * obs.position.alt;
    totalBetaObs += beta;

    if (beta > bestBeta) {
      bestBeta = beta;
      bestObs = obs;
    }
  }

  if (totalBetaObs < 1e-10) {
    return {
      state: { ...track.state },
      covariance: track.covariance.map(row => [...row]) as Covariance3x3,
      confidence: track.confidence,
      radialVelocity: track.radialVelocity,
      dopplerQuality: track.dopplerQuality,
    };
  }

  // Weighted position
  const wLat = combinedLat / totalBetaObs;
  const wLon = combinedLon / totalBetaObs;
  const wAlt = combinedAlt / totalBetaObs;

  // Blend with track state using betaMiss
  const fusedLat = betaMiss * track.state.lat + totalBetaObs * wLat;
  const fusedLon = betaMiss * track.state.lon + totalBetaObs * wLon;
  const fusedAlt = betaMiss * track.state.alt + totalBetaObs * wAlt;

  // Compute blended covariance
  // Start with a weighted average of observation covariances
  let covSum: Covariance3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const [oi, beta] of betas.betas) {
    if (oi < 0 || oi >= observations.length) continue;
    const obs = observations[oi];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        covSum[r][c] += beta * obs.covariance[r][c];
      }
    }
  }

  // Spread-of-means: add covariance due to the spread of weighted observations
  for (const [oi, beta] of betas.betas) {
    if (oi < 0 || oi >= observations.length) continue;
    const obs = observations[oi];
    const dLat = obs.position.lat - fusedLat;
    const dLon = obs.position.lon - fusedLon;
    const dAlt = obs.position.alt - fusedAlt;
    const dx = [dLat, dLon, dAlt];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        covSum[r][c] += beta * dx[r] * dx[c];
      }
    }
  }

  // Blend with track covariance
  const fusedCov: Covariance3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      fusedCov[r][c] = betaMiss * track.covariance[r][c] + totalBetaObs * covSum[r][c];
    }
  }

  // Confidence: increase proportional to total observation beta
  const confidenceBoost = totalBetaObs * 0.1;
  const confidence = Math.min(1, Math.max(0, track.confidence + confidenceBoost));

  return {
    state: {
      lat: fusedLat,
      lon: normalizeLon(fusedLon),
      alt: fusedAlt,
    },
    covariance: fusedCov,
    confidence,
    radialVelocity: bestObs?.radialVelocity ?? track.radialVelocity,
    dopplerQuality: bestObs?.dopplerQuality ?? track.dopplerQuality,
  };
}
