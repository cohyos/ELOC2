import type {
  Covariance3x3,
  DopplerQuality,
  MotionModelStatus,
  Position3D,
  RegistrationState,
  SourceObservation,
  SystemTrack,
} from '@eloc2/domain';
import { mat3x3Inverse, mat3x3Add, normalizeLon, geodeticToENU, enuToGeodetic } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface FusedState {
  state: Position3D;
  covariance: Covariance3x3;
  confidence: number;
  radialVelocity?: number;
  dopplerQuality?: DopplerQuality;
  /** Bayesian existence probability, updated by existence calculator. */
  existenceProbability?: number;
  /** Active motion model from IMM filter. */
  motionModelStatus?: MotionModelStatus;
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
  // ── Predict track state forward to observation time ──
  // Without prediction, the fuser uses the stale track position, causing
  // the fused result to lag behind the true position by ~v*dt. After many
  // fusions the track covariance shrinks, making the fused position cling
  // to the stale position rather than the observation. This created a
  // persistent ~1km position error for moving targets.
  const DEG_TO_RAD = Math.PI / 180;
  let predLat = track.state.lat;
  let predLon = track.state.lon;
  let predAlt = track.state.alt;
  let predCov = track.covariance;

  if (track.velocity && track.lastUpdated > 0) {
    const dtSec = (observation.timestamp - track.lastUpdated) / 1000;
    if (dtSec > 0 && dtSec < 30) {
      const metersPerDegLat = 111_320;
      const metersPerDegLon = metersPerDegLat * Math.cos(predLat * DEG_TO_RAD);
      predLat += (track.velocity.vy * dtSec) / metersPerDegLat;
      predLon += (track.velocity.vx * dtSec) / metersPerDegLon;
      predAlt += (track.velocity.vz ?? 0) * dtSec;

      // Grow covariance with process noise (same as correlator)
      const speed = Math.sqrt(
        (track.velocity.vx ?? 0) ** 2 +
        (track.velocity.vy ?? 0) ** 2 +
        (track.velocity.vz ?? 0) ** 2,
      );
      const baseQ = 500;
      const speedFactor = 1 + speed / 200;
      const qDiag = baseQ * speedFactor * dtSec;
      predCov = [
        [track.covariance[0][0] + qDiag, track.covariance[0][1], track.covariance[0][2]],
        [track.covariance[1][0], track.covariance[1][1] + qDiag, track.covariance[1][2]],
        [track.covariance[2][0], track.covariance[2][1], track.covariance[2][2] + qDiag],
      ] as Covariance3x3;
    }
  }

  const invTrackCov = mat3x3Inverse(predCov);

  // Downweight observations with blind Doppler quality by inflating covariance 4x
  const obsCov = observation.dopplerQuality === 'blind'
    ? observation.covariance.map(row => row.map(v => v * 4)) as Covariance3x3
    : observation.covariance;
  const invObsCov = mat3x3Inverse(obsCov);

  if (invTrackCov === null || invObsCov === null) {
    // Fallback: simple averaging
    return fallbackAverage(observation, track);
  }

  // Information matrix = P_predicted^-1 + P_obs^-1
  const infoMatrix = mat3x3Add(invTrackCov, invObsCov);
  const fusedCov = mat3x3Inverse(infoMatrix);

  if (fusedCov === null) {
    // Fallback: simple averaging
    return fallbackAverage(observation, track);
  }

  // ── Convert to ENU coordinates centered on the track position ──
  // Operating in lat/lon/alt directly causes numerical issues because
  // latitude and longitude have vastly different scales from altitude (meters).
  // ENU provides a local Cartesian frame where all axes are in meters.
  const refLat = predLat;
  const refLon = predLon;
  const refAlt = predAlt;

  // Track is at the ENU origin
  const xTrack = [0, 0, 0];

  // Observation in ENU relative to track
  const obsENU = geodeticToENU(
    observation.position.lat, observation.position.lon, observation.position.alt,
    refLat, refLon, refAlt,
  );
  const xObs = [obsENU.east, obsENU.north, obsENU.up];

  // Information-weighted state: P_track^-1 * x_track + P_obs^-1 * x_obs
  // Since xTrack = [0,0,0], the first term vanishes.
  const infoState: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      infoState[i] += invTrackCov[i][j] * xTrack[j] + invObsCov[i][j] * xObs[j];
    }
  }

  // Fused state in ENU: P_fused * infoState
  const fusedENU: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      fusedENU[i] += fusedCov[i][j] * infoState[j];
    }
  }

  // Convert fused ENU back to geodetic
  const fusedGeo = enuToGeodetic(fusedENU[0], fusedENU[1], fusedENU[2], refLat, refLon, refAlt);

  // Compute a confidence score based on the trace of the fused covariance
  // relative to the track's previous covariance.
  // Lower trace = higher confidence. Clamp to [0, 1].
  const traceFused = fusedCov[0][0] + fusedCov[1][1] + fusedCov[2][2];
  const traceTrack = track.covariance[0][0] + track.covariance[1][1] + track.covariance[2][2];

  // Confidence increases when fused covariance shrinks
  const improvement = traceTrack > 0 ? 1 - traceFused / traceTrack : 0;
  // Blend with previous confidence: take the better of current confidence or a boost
  const confidence = Math.min(1, Math.max(0, track.confidence + improvement * 0.1));

  // Propagate Doppler: prefer observation unless quality is blind
  const radialVelocity = observation.dopplerQuality !== 'blind'
    ? observation.radialVelocity ?? track.radialVelocity
    : track.radialVelocity;
  const dopplerQuality = observation.dopplerQuality ?? track.dopplerQuality;

  return {
    state: {
      lat: fusedGeo.lat,
      lon: normalizeLon(fusedGeo.lon),
      alt: fusedGeo.alt,
    },
    covariance: fusedCov,
    confidence,
    radialVelocity,
    dopplerQuality,
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
    radialVelocity: observation.radialVelocity ?? track.radialVelocity,
    dopplerQuality: observation.dopplerQuality ?? track.dopplerQuality,
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

  // Confirmation-only mode — use observation position but with inflated
  // covariance (2x the observation's) to reflect lower trust in the
  // unregistered sensor.  We MUST still update the position so the track
  // follows the target; otherwise the correlation gate loses the target
  // after a few observations and a new track is created each time.
  const dLat = observation.position.lat - track.state.lat;
  const dLon = observation.position.lon - track.state.lon;
  const dAlt = observation.position.alt - track.state.alt;
  const distSq = dLat * dLat + dLon * dLon + dAlt * dAlt;

  // "Close" threshold: roughly 0.01 degree ≈ 1 km
  const isClose = distSq < 0.01 * 0.01;

  const confidenceBoost = isClose ? 0.01 : 0.005;
  const confidence = Math.min(1, Math.max(0, track.confidence + confidenceBoost));

  // Update position to observation (move the gate with the target)
  // but inflate covariance to 2x observation's to express lower trust.
  const inflatedCov = observation.covariance.map((row) =>
    row.map((v) => v * 2),
  ) as Covariance3x3;

  return {
    state: { ...observation.position },
    covariance: inflatedCov,
    confidence,
    radialVelocity: observation.dopplerQuality !== 'blind'
      ? observation.radialVelocity ?? track.radialVelocity
      : track.radialVelocity,
    dopplerQuality: observation.dopplerQuality ?? track.dopplerQuality,
  };
}
