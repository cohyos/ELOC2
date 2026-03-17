import type { ScoreBreakdown } from '@eloc2/domain';
import { bearingDeg, shortestAngleDelta } from '@eloc2/shared-utils';
import type { TaskCandidate } from '../candidate-generation/generator.js';

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

/** Weights for the multi-criteria scoring function. */
export interface ScoringWeights {
  threat: number;
  uncertaintyReduction: number;
  geometryGain: number;
  operatorIntent: number;
  slewCost: number;
  occupancyCost: number;
}

/** Default scoring weights tuned for balanced operation. */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  threat: 1.0,
  uncertaintyReduction: 1.0,
  geometryGain: 0.5,
  operatorIntent: 2.0,
  slewCost: 0.3,
  occupancyCost: 0.5,
};

// ---------------------------------------------------------------------------
// Active bearing type for intersection potential
// ---------------------------------------------------------------------------

/** An existing bearing observation on a track from another sensor. */
export interface ActiveBearing {
  sensorId: string;
  azimuthDeg: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Estimates how much geometric value a new bearing from the candidate sensor
 * would add, given existing bearings on the track.
 *
 * Based on the angle between the candidate sensor's bearing to the track and
 * existing bearings. Perpendicular bearings (90°) give maximum value;
 * parallel bearings (0° or 180°) give near-zero value.
 *
 * Returns a value in [0, 1]. If no active bearings are provided, returns 1.0
 * (assume maximum potential).
 */
export function computeIntersectionPotential(
  candidate: TaskCandidate,
  activeBearings: ActiveBearing[],
): number {
  if (activeBearings.length === 0) return 1.0;

  // Compute predicted bearing from candidate sensor to track
  const predictedBearing = bearingDeg(
    candidate.sensorState.position.lat,
    candidate.sensorState.position.lon,
    candidate.systemTrack.state.lat,
    candidate.systemTrack.state.lon,
  );

  // Find the best intersection angle among all active bearings
  let maxSinAngle = 0;
  for (const ab of activeBearings) {
    const angleDelta = Math.abs(shortestAngleDelta(predictedBearing, ab.azimuthDeg));
    // sin(angle) peaks at 90°, giving max geometric value
    const sinAngle = Math.abs(Math.sin((angleDelta * Math.PI) / 180));
    if (sinAngle > maxSinAngle) {
      maxSinAngle = sinAngle;
    }
  }

  return maxSinAngle;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores a single task candidate based on multiple criteria.
 *
 * @param candidate           - The track-sensor pair to score.
 * @param weights             - Optional scoring weights (defaults to DEFAULT_WEIGHTS).
 * @param operatorHighInterest - Set of system-track IDs the operator has marked as high interest.
 * @param sensorOccupancy     - Map from sensorId to the number of tasks currently occupying it.
 * @param activeBearings      - Existing bearing observations on this track (for intersection potential).
 * @param timeSinceLastObservation - Seconds since last observation of this track (for revisit factor).
 * @returns A ScoreBreakdown with individual factors and total score.
 */
export function scoreCandidate(
  candidate: TaskCandidate,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  operatorHighInterest: Set<string> = new Set(),
  sensorOccupancy: Map<string, number> = new Map(),
  activeBearings?: ActiveBearing[],
  timeSinceLastObservation: number = 0,
): ScoreBreakdown {
  const { systemTrack, sensorState } = candidate;

  // ── Threat score ──────────────────────────────────────────────────────
  // Base from confidence, boosted by lower altitude and higher speed.
  const confidenceBase = systemTrack.confidence * 10;
  const altPenalty = Math.max(0, 1 - systemTrack.state.alt / 15000); // lower alt = higher threat
  const speedBonus = systemTrack.velocity
    ? Math.sqrt(
        systemTrack.velocity.vx ** 2 +
          systemTrack.velocity.vy ** 2 +
          systemTrack.velocity.vz ** 2,
      ) / 500 // normalize speed contribution
    : 0;

  // Closure rate bonus: radial velocity toward sensor (negative = approaching)
  let closureRateBonus = 0;
  if (systemTrack.velocity) {
    // Compute unit vector from track to sensor
    const dlat = sensorState.position.lat - systemTrack.state.lat;
    const dlon = sensorState.position.lon - systemTrack.state.lon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);
    if (dist > 0) {
      const ux = dlat / dist;
      const uy = dlon / dist;
      // Radial velocity: positive = moving toward sensor
      const radialVelocity =
        systemTrack.velocity.vx * ux + systemTrack.velocity.vy * uy;
      // Approaching targets (positive radial velocity toward sensor) get bonus
      closureRateBonus = Math.max(0, radialVelocity / 200);
    }
  }

  const threatScore = confidenceBase * (1 + altPenalty + speedBonus + closureRateBonus);

  // ── Uncertainty reduction ─────────────────────────────────────────────
  // Inverse of covariance trace — larger uncertainty means more value.
  const cov = systemTrack.covariance;
  const trace =
    (cov[0]?.[0] ?? 0) + (cov[1]?.[1] ?? 0) + (cov[2]?.[2] ?? 0);
  const uncertaintyReduction = trace > 0 ? Math.min(10, Math.sqrt(trace) / 100) : 0;

  // ── Geometry gain ─────────────────────────────────────────────────────
  // Dynamic: base 5.0 scaled by intersection potential and revisit factor.
  const intersectionPotential = activeBearings
    ? computeIntersectionPotential(candidate, activeBearings)
    : 1.0;
  const revisitFactor = 1 + (timeSinceLastObservation / 60);
  const geometryGain = 5.0 * intersectionPotential * revisitFactor;

  // ── Operator intent ───────────────────────────────────────────────────
  const operatorIntent = operatorHighInterest.has(
    candidate.systemTrackId as string,
  )
    ? 3.0
    : 0;

  // ── Slew cost ─────────────────────────────────────────────────────────
  // Proportional to angular distance from current gimbal pointing to target.
  let slewCost = 0;
  if (sensorState.gimbal) {
    const targetBearing = bearingDeg(
      sensorState.position.lat,
      sensorState.position.lon,
      systemTrack.state.lat,
      systemTrack.state.lon,
    );
    const deltaAz = Math.abs(shortestAngleDelta(sensorState.gimbal.azimuthDeg, targetBearing));
    slewCost = deltaAz / 18; // normalize: 180° → 10
  }

  // ── Occupancy cost ────────────────────────────────────────────────────
  const occupancy = sensorOccupancy.get(candidate.sensorId as string) ?? 0;
  const occupancyCost = occupancy > 0 ? occupancy * 2.0 : 0;

  // ── Total ─────────────────────────────────────────────────────────────
  const total =
    weights.threat * threatScore +
    weights.uncertaintyReduction * uncertaintyReduction +
    weights.geometryGain * geometryGain +
    weights.operatorIntent * operatorIntent -
    weights.slewCost * slewCost -
    weights.occupancyCost * occupancyCost;

  return {
    threatScore,
    uncertaintyReduction,
    geometryGain,
    operatorIntent,
    slewCost,
    occupancyCost,
    total,
  };
}
