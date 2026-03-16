import type {
  Covariance3x3,
  Position3D,
  RegistrationState,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import { mat3x3Inverse, mat3x3Add, normalizeLon } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface FusedState {
  state: Position3D;
  covariance: Covariance3x3;
  confidence: number;
}

// ---------------------------------------------------------------------------
// fuseObservation
// ---------------------------------------------------------------------------

/**
 * Fuse an observation into an existing track using information-matrix fusion.
 *
 * The information matrix approach:
 *   P_fused = (P_track^-1 + P_obs^-1)^-1
 *   x_fused = P_fused * (P_track^-1 * x_track + P_obs^-1 * x_obs)
 *
 * Position vectors are represented as [lat, lon, alt].
 *
 * If any matrix inverse fails (singular covariance), falls back to simple
 * averaging of positions with the observation covariance as the result.
 */
export function fuseObservation(
  observation: SourceObservation,
  track: SystemTrack,
): FusedState {
  const invTrackCov = mat3x3Inverse(track.covariance);
  const invObsCov = mat3x3Inverse(observation.covariance);

  if (invTrackCov === null || invObsCov === null) {
    // Fallback: simple averaging
    return fallbackAverage(observation, track);
  }

  // Information matrix = P_track^-1 + P_obs^-1
  const infoMatrix = mat3x3Add(invTrackCov, invObsCov);
  const fusedCov = mat3x3Inverse(infoMatrix);

  if (fusedCov === null) {
    // Fallback: simple averaging
    return fallbackAverage(observation, track);
  }

  // State vectors
  const xTrack = [track.state.lat, track.state.lon, track.state.alt];
  const xObs = [observation.position.lat, observation.position.lon, observation.position.alt];

  // Information-weighted state: P_track^-1 * x_track + P_obs^-1 * x_obs
  const infoState: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      infoState[i] += invTrackCov[i][j] * xTrack[j] + invObsCov[i][j] * xObs[j];
    }
  }

  // Fused state: P_fused * infoState
  const fusedState: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      fusedState[i] += fusedCov[i][j] * infoState[j];
    }
  }

  // Compute a confidence score based on the trace of the fused covariance
  // relative to the track's previous covariance.
  // Lower trace = higher confidence. Clamp to [0, 1].
  const traceFused = fusedCov[0][0] + fusedCov[1][1] + fusedCov[2][2];
  const traceTrack = track.covariance[0][0] + track.covariance[1][1] + track.covariance[2][2];

  // Confidence increases when fused covariance shrinks
  const improvement = traceTrack > 0 ? 1 - traceFused / traceTrack : 0;
  // Blend with previous confidence: take the better of current confidence or a boost
  const confidence = Math.min(1, Math.max(0, track.confidence + improvement * 0.1));

  return {
    state: {
      lat: fusedState[0],
      lon: normalizeLon(fusedState[1]),
      alt: fusedState[2],
    },
    covariance: fusedCov,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallbackAverage(
  observation: SourceObservation,
  track: SystemTrack,
): FusedState {
  return {
    state: {
      lat: (track.state.lat + observation.position.lat) / 2,
      lon: normalizeLon((track.state.lon + observation.position.lon) / 2),
      alt: (track.state.alt + observation.position.alt) / 2,
    },
    covariance: observation.covariance,
    confidence: Math.min(1, Math.max(0, track.confidence + 0.05)),
  };
}

// ---------------------------------------------------------------------------
// Registration-aware fusion
// ---------------------------------------------------------------------------

/**
 * Fuse an observation into a track, gated by the sensor's registration
 * health.
 *
 * - If `registrationHealth` is `undefined` **or** `fusionSafe === true`:
 *   perform full information-matrix fusion via {@link fuseObservation}.
 * - If `fusionSafe === false`: enter **confirmation-only mode** — the track
 *   state is returned unchanged but the confidence is adjusted:
 *   a small boost (0.01) is applied when the observation is close to the
 *   track, otherwise the confidence growth rate is halved.
 */
export function fuseWithRegistration(
  observation: SourceObservation,
  track: SystemTrack,
  registrationHealth: RegistrationState | undefined,
): FusedState {
  // Full fusion path
  if (!registrationHealth || registrationHealth.fusionSafe) {
    return fuseObservation(observation, track);
  }

  // Confirmation-only mode — keep track state, adjust confidence
  const dLat = observation.position.lat - track.state.lat;
  const dLon = observation.position.lon - track.state.lon;
  const dAlt = observation.position.alt - track.state.alt;
  const distSq = dLat * dLat + dLon * dLon + dAlt * dAlt;

  // "Close" threshold: roughly 0.01 degree ≈ 1 km
  const isClose = distSq < 0.01 * 0.01;

  const confidenceBoost = isClose ? 0.01 : 0.005;
  const confidence = Math.min(1, Math.max(0, track.confidence + confidenceBoost));

  return {
    state: { ...track.state },
    covariance: track.covariance.map((row) => [...row]) as Covariance3x3,
    confidence,
  };
}
