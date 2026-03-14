import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
} from '@eloc2/domain';
import type { CorrelationDecision } from '@eloc2/events';
import { geodeticToENU, mat3x3Inverse, mat3x3Add, mahalanobisDistance } from '@eloc2/shared-utils';

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
  /** Chi-squared gate threshold. Default 9.21 (2-DoF, 99% confidence). */
  gateThreshold: number;
}

const DEFAULT_CONFIG: CorrelatorConfig = {
  gateThreshold: 9.21,
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

    // Convert track position to ENU relative to the observation
    const enu = geodeticToENU(
      track.state.lat,
      track.state.lon,
      track.state.alt,
      refLat,
      refLon,
      refAlt,
    );

    // The observation is at ENU origin, so the difference vector is just the
    // track's ENU coordinates (track_enu - obs_enu where obs_enu = [0,0,0]).
    const dx = [enu.east, enu.north, enu.up];

    // Combined covariance = P_track + P_obs
    const combinedCov = mat3x3Add(track.covariance, observation.covariance);
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
