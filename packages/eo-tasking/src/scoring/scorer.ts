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
// Scoring
// ---------------------------------------------------------------------------

/**
 * Scores a single task candidate based on multiple criteria.
 *
 * @param candidate           - The track-sensor pair to score.
 * @param weights             - Optional scoring weights (defaults to DEFAULT_WEIGHTS).
 * @param operatorHighInterest - Set of system-track IDs the operator has marked as high interest.
 * @param sensorOccupancy     - Map from sensorId to the number of tasks currently occupying it.
 * @returns A ScoreBreakdown with individual factors and total score.
 */
export function scoreCandidate(
  candidate: TaskCandidate,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  operatorHighInterest: Set<string> = new Set(),
  sensorOccupancy: Map<string, number> = new Map(),
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
  const threatScore = confidenceBase * (1 + altPenalty + speedBonus);

  // ── Uncertainty reduction ─────────────────────────────────────────────
  // Inverse of covariance trace — larger uncertainty means more value.
  const cov = systemTrack.covariance;
  const trace =
    (cov[0]?.[0] ?? 0) + (cov[1]?.[1] ?? 0) + (cov[2]?.[2] ?? 0);
  const uncertaintyReduction = trace > 0 ? Math.min(10, Math.sqrt(trace) / 100) : 0;

  // ── Geometry gain ─────────────────────────────────────────────────────
  // Placeholder: use 5.0 as default geometry gain value.
  const geometryGain = 5.0;

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
