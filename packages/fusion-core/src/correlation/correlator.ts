import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  Covariance3x3,
} from '@eloc2/domain';
import type { CorrelationDecision } from '@eloc2/events';
import { geodeticToENU, mat3x3Inverse, mat3x3Add, mahalanobisDistance, DEG_TO_RAD } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CorrelationResult {
  decision: CorrelationDecision;
  selectedTrackId: SystemTrackId | undefined;
  score: number;
  method: string;
  candidates: Array<{ trackId: SystemTrackId; distance: number }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CorrelatorConfig {
  /**
   * Chi-squared gate threshold.
   * Default 16.27 (3-DoF, 99.9% confidence).
   * Previously 9.21 (2-DoF, 99%) which was too tight for 3D ENU correlation,
   * causing ghost tracks when sensor noise exceeded the gate radius.
   */
  gateThreshold: number;
  /**
   * Maximum allowed mismatch (m/s) between observed Doppler radial velocity
   * and predicted radial velocity from track state. Candidates exceeding this
   * are rejected even if they pass the spatial gate.
   * Default 50 m/s.
   */
  velocityGateThreshold: number;
}

const DEFAULT_CONFIG: CorrelatorConfig = {
  gateThreshold: 20.0, // Widened from 16.27 to reduce ghost track proliferation
  velocityGateThreshold: 75, // Widened from 50 m/s for turning/maneuvering targets
};

// ---------------------------------------------------------------------------
// correlate
// ---------------------------------------------------------------------------

/**
 * Correlate an incoming observation against existing system tracks.
 *
 * Uses Mahalanobis distance in a local ENU frame to decide whether the
 * observation should be associated with an existing track or used to
 * initialise a new one.
 *
 * The combined covariance (track + observation) is used as the statistical
 * gate.  The Mahalanobis *squared* distance is compared against the gate
 * threshold (chi-squared value).
 */
export function correlate(
  observation: SourceObservation,
  existingTracks: SystemTrack[],
  config: CorrelatorConfig = DEFAULT_CONFIG,
): CorrelationResult {
  const method = 'mahalanobis_enu';

  if (existingTracks.length === 0) {
    return {
      decision: 'new_track',
      selectedTrackId: undefined,
      score: Infinity,
      method,
      candidates: [],
    };
  }

  // Use the observation position as the ENU reference origin.
  const refLat = observation.position.lat;
  const refLon = observation.position.lon;
  const refAlt = observation.position.alt;

  const candidates: Array<{ trackId: SystemTrackId; distance: number }> = [];

  for (const track of existingTracks) {
    // Skip dropped tracks
    if (track.status === 'dropped') continue;

    // Predict track position forward using velocity (constant-velocity model).
    // Without prediction, fast-moving targets (300 m/s) exceed the Mahalanobis
    // gate within 1-2 ticks, creating ghost tracks.
    let predLat = track.state.lat;
    let predLon = track.state.lon;
    let predAlt = track.state.alt;
    let predCov = track.covariance;

    if (track.velocity && track.lastUpdated > 0) {
      const dtSec = (observation.timestamp - track.lastUpdated) / 1000;
      if (dtSec > 0 && dtSec < 30) { // only predict up to 30s
        // Propagate position using velocity (ENU approximation)
        const metersPerDegLat = 111_320;
        const metersPerDegLon = metersPerDegLat * Math.cos(predLat * DEG_TO_RAD);
        predLat += (track.velocity.vy * dtSec) / metersPerDegLat;
        predLon += (track.velocity.vx * dtSec) / metersPerDegLon;
        predAlt += (track.velocity.vz ?? 0) * dtSec;

        // Grow covariance with process noise.
        // Use velocity-adaptive Q: fast movers need larger uncertainty growth
        // to prevent gate misses and ghost track proliferation.
        const speed = Math.sqrt(
          (track.velocity!.vx ?? 0) ** 2 +
          (track.velocity!.vy ?? 0) ** 2 +
          (track.velocity!.vz ?? 0) ** 2,
        );
        const baseQ = 200; // m²/s base process noise
        const speedFactor = 1 + speed / 200; // scale with speed
        const qDiag = baseQ * speedFactor * dtSec;
        predCov = [
          [track.covariance[0][0] + qDiag, track.covariance[0][1], track.covariance[0][2]],
          [track.covariance[1][0], track.covariance[1][1] + qDiag, track.covariance[1][2]],
          [track.covariance[2][0], track.covariance[2][1], track.covariance[2][2] + qDiag],
        ] as Covariance3x3;
      }
    }

    // Convert predicted track position to ENU relative to the observation
    const enu = geodeticToENU(
      predLat,
      predLon,
      predAlt,
      refLat,
      refLon,
      refAlt,
    );

    // The observation is at ENU origin, so the difference vector is just the
    // track's ENU coordinates (track_enu - obs_enu where obs_enu = [0,0,0]).
    const dx = [enu.east, enu.north, enu.up];

    // Combined covariance = P_predicted + P_obs
    const combinedCov = mat3x3Add(predCov, observation.covariance);
    const invCombinedCov = mat3x3Inverse(combinedCov);

    if (invCombinedCov === null) {
      // Singular combined covariance — cannot compute distance, skip
      continue;
    }

    // Mahalanobis distance (not squared — the utility returns sqrt)
    const dist = mahalanobisDistance(dx, invCombinedCov);

    // Compare squared distance against the gate threshold
    const distSquared = dist * dist;

    if (distSquared <= config.gateThreshold) {
      // Velocity consistency gate: reject if Doppler radial velocity
      // disagrees with the predicted radial velocity from the track state.
      if (
        observation.radialVelocity !== undefined &&
        track.velocity &&
        track.radialVelocity !== undefined
      ) {
        const dlat = track.state.lat - observation.position.lat;
        const dlon = track.state.lon - observation.position.lon;
        const dist2d = Math.sqrt(dlat * dlat + dlon * dlon);
        if (dist2d > 1e-9) {
          const ux = dlon / dist2d;
          const uy = dlat / dist2d;
          const predictedVr = track.velocity.vx * ux + track.velocity.vy * uy;
          const vrDiff = Math.abs(observation.radialVelocity - predictedVr);
          if (vrDiff > config.velocityGateThreshold) continue;
        }
      }

      candidates.push({ trackId: track.systemTrackId, distance: distSquared });
    }
  }

  if (candidates.length === 0) {
    return {
      decision: 'new_track',
      selectedTrackId: undefined,
      score: Infinity,
      method,
      candidates: [],
    };
  }

  // Sort by distance ascending and pick the nearest
  candidates.sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];

  return {
    decision: 'associated',
    selectedTrackId: nearest.trackId,
    score: nearest.distance,
    method,
    candidates,
  };
}
