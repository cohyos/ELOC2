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
  mat3x3Scale,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConservativeFusionResult {
  state: Position3D;
  covariance: Covariance3x3;
  confidence: number;
  method: 'covariance_intersection';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trace3x3(m: number[][]): number {
  return m[0][0] + m[1][1] + m[2][2];
}

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
// conservativeFuse
// ---------------------------------------------------------------------------

/**
 * Covariance Intersection (CI) fusion.
 *
 * CI does NOT assume known cross-covariance between the two estimates,
 * making it safe for EO or degraded-registration fusion.
 *
 * Algorithm:
 * 1. Convert track and observation to ENU frame (reference = track position).
 * 2. Search omega in [0, 1] (step 0.1) to minimize trace of fused covariance:
 *      P_f = (omega * P_track^-1 + (1-omega) * P_obs^-1)^-1
 * 3. Fused state:
 *      x_f = P_f * (omega * P_track^-1 * x_track + (1-omega) * P_obs^-1 * x_obs)
 * 4. Convert fused state back to geodetic.
 */
export function conservativeFuse(
  track: SystemTrack,
  observation: SourceObservation,
): ConservativeFusionResult {
  // Use track position as ENU reference
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

  const Pt = track.covariance;
  const Po = observation.covariance;

  const invPt = mat3x3Inverse(Pt);
  const invPo = mat3x3Inverse(Po);

  // If either inverse fails, fallback to simple average
  if (invPt === null || invPo === null) {
    return fallbackResult(track, observation);
  }

  // Search for optimal omega that minimizes trace of fused covariance
  let bestOmega = 0.5;
  let bestTrace = Infinity;
  let bestPf: number[][] | null = null;

  for (let omega = 0; omega <= 1.0 + 1e-9; omega += 0.1) {
    const w = Math.min(1, Math.max(0, omega)); // clamp for floating point
    const scaledInvPt = mat3x3Scale(invPt, w);
    const scaledInvPo = mat3x3Scale(invPo, 1 - w);
    const infoSum = mat3x3Add(scaledInvPt, scaledInvPo);
    const Pf = mat3x3Inverse(infoSum);
    if (Pf === null) continue;

    const t = trace3x3(Pf);
    if (t < bestTrace) {
      bestTrace = t;
      bestOmega = w;
      bestPf = Pf;
    }
  }

  if (bestPf === null) {
    return fallbackResult(track, observation);
  }

  // Fused state: x_f = P_f * (omega * P_t^-1 * x_t + (1-omega) * P_o^-1 * x_o)
  const scaledInvPt = mat3x3Scale(invPt, bestOmega);
  const scaledInvPo = mat3x3Scale(invPo, 1 - bestOmega);

  const infoTrack = mat3x3MulVec(scaledInvPt, xTrack);
  const infoObs = mat3x3MulVec(scaledInvPo, xObs);

  const infoState = [
    infoTrack[0] + infoObs[0],
    infoTrack[1] + infoObs[1],
    infoTrack[2] + infoObs[2],
  ];

  const fusedENU = mat3x3MulVec(bestPf, infoState);

  // Convert back to geodetic
  const fusedGeodetic = enuToGeodetic(
    fusedENU[0], fusedENU[1], fusedENU[2],
    refLat, refLon, refAlt,
  );

  // Confidence: conservative boost
  const traceTrack = trace3x3(Pt);
  const improvement = traceTrack > 0 ? 1 - bestTrace / traceTrack : 0;
  const boost = Math.min(0.05, improvement * 0.05);
  const confidence = Math.min(1, Math.max(0, track.confidence + boost));

  return {
    state: {
      lat: fusedGeodetic.lat,
      lon: fusedGeodetic.lon,
      alt: fusedGeodetic.alt,
    },
    covariance: bestPf as Covariance3x3,
    confidence,
    method: 'covariance_intersection',
  };
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallbackResult(
  track: SystemTrack,
  observation: SourceObservation,
): ConservativeFusionResult {
  return {
    state: {
      lat: (track.state.lat + observation.position.lat) / 2,
      lon: (track.state.lon + observation.position.lon) / 2,
      alt: (track.state.alt + observation.position.alt) / 2,
    },
    covariance: observation.covariance,
    confidence: Math.min(1, Math.max(0, track.confidence + 0.01)),
    method: 'covariance_intersection',
  };
}
