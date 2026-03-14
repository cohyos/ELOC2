import type {
  Covariance3x3,
  Position3D,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import {
  geodeticToENU,
  enuToGeodetic,
  mat3x3Inverse,
  mat3x3Add,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CentralizedFusionResult {
  state: Position3D;
  covariance: Covariance3x3;
  confidence: number;
  method: 'centralized_information_matrix';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Multiply a 3x3 matrix by a 3-vector. */
function mat3x3MulVec(m: number[][], v: number[]): number[] {
  const result = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i] += m[i][j] * v[j];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// centralizedFuse
// ---------------------------------------------------------------------------

/**
 * Standard information-matrix Kalman fusion.
 *
 * Assumes known (and zero) cross-covariance between track and observation:
 *   P_f = (P_t^-1 + P_o^-1)^-1
 *   x_f = P_f * (P_t^-1 * x_t + P_o^-1 * x_o)
 *
 * All math is performed in a local ENU frame (reference = track position),
 * then converted back to geodetic.
 */
export function centralizedFuse(
  track: SystemTrack,
  observation: SourceObservation,
): CentralizedFusionResult {
  const refLat = track.state.lat;
  const refLon = track.state.lon;
  const refAlt = track.state.alt;

  // Convert to ENU
  const trackENU = geodeticToENU(
    track.state.lat, track.state.lon, track.state.alt,
    refLat, refLon, refAlt,
  );
  const obsENU = geodeticToENU(
    observation.position.lat, observation.position.lon, observation.position.alt,
    refLat, refLon, refAlt,
  );

  const xTrack = [trackENU.east, trackENU.north, trackENU.up];
  const xObs = [obsENU.east, obsENU.north, obsENU.up];

  const invPt = mat3x3Inverse(track.covariance);
  const invPo = mat3x3Inverse(observation.covariance);

  if (invPt === null || invPo === null) {
    return fallbackResult(track, observation);
  }

  // Information matrix fusion
  const infoMatrix = mat3x3Add(invPt, invPo);
  const fusedCov = mat3x3Inverse(infoMatrix);

  if (fusedCov === null) {
    return fallbackResult(track, observation);
  }

  // Information-weighted state
  const infoTrack = mat3x3MulVec(invPt, xTrack);
  const infoObs = mat3x3MulVec(invPo, xObs);
  const infoState = [
    infoTrack[0] + infoObs[0],
    infoTrack[1] + infoObs[1],
    infoTrack[2] + infoObs[2],
  ];

  const fusedENU = mat3x3MulVec(fusedCov, infoState);

  // Convert back to geodetic
  const fusedGeodetic = enuToGeodetic(
    fusedENU[0], fusedENU[1], fusedENU[2],
    refLat, refLon, refAlt,
  );

  // Confidence: improvement based on trace reduction
  const traceFused = fusedCov[0][0] + fusedCov[1][1] + fusedCov[2][2];
  const traceTrack =
    track.covariance[0][0] + track.covariance[1][1] + track.covariance[2][2];

  const improvement = traceTrack > 0 ? 1 - traceFused / traceTrack : 0;
  const confidence = Math.min(1, Math.max(0, track.confidence + improvement * 0.1));

  return {
    state: {
      lat: fusedGeodetic.lat,
      lon: fusedGeodetic.lon,
      alt: fusedGeodetic.alt,
    },
    covariance: fusedCov as Covariance3x3,
    confidence,
    method: 'centralized_information_matrix',
  };
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallbackResult(
  track: SystemTrack,
  observation: SourceObservation,
): CentralizedFusionResult {
  return {
    state: {
      lat: (track.state.lat + observation.position.lat) / 2,
      lon: (track.state.lon + observation.position.lon) / 2,
      alt: (track.state.alt + observation.position.alt) / 2,
    },
    covariance: observation.covariance,
    confidence: Math.min(1, Math.max(0, track.confidence + 0.05)),
    method: 'centralized_information_matrix',
  };
}
