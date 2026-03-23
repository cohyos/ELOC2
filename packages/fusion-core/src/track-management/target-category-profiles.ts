/**
 * Target Category Profiles — Dual-Hypothesis Parameter Sets
 *
 * Defines BM (Ballistic Missile) and ABT (Air-Breathing Target) parameter
 * profiles for early-stage dual-hypothesis tracking. In early detection
 * (first 2–3 observations), the system evaluates incoming observations
 * against BOTH profiles in parallel. Once velocity and trajectory angle
 * provide enough evidence, the system commits to one profile.
 *
 * Key differences:
 * - BM: Very high speed (700–2500 m/s), steep climb angles, short track life
 *   → wide gates, fast confirmation, aggressive coasting timeout
 * - ABT: Low-to-moderate speed (44–260 m/s), shallow flight angles, long loiter
 *   → tight gates, standard confirmation, generous coasting
 */

import type { CorrelatorConfig } from '../correlation/correlator.js';
import type { ConsistencyConfig } from './consistency-evaluator.js';

// ---------------------------------------------------------------------------
// Target category type
// ---------------------------------------------------------------------------

export type TargetCategory = 'bm' | 'abt' | 'unresolved';

// ---------------------------------------------------------------------------
// Profile: combines correlator, track lifecycle, and consistency params
// ---------------------------------------------------------------------------

export interface CategoryProfile {
  /** Correlator gate thresholds */
  correlator: CorrelatorConfig;

  /** Track lifecycle parameters */
  confirmAfter: number;
  dropAfterMisses: number;
  pDetection: number;
  pFalseAlarm: number;
  existencePromotionThreshold: number;
  existenceConfirmationThreshold: number;
  existenceDeletionThreshold: number;
  coastingMissThreshold: number;
  maxCoastingTimeSec: number;

  /** 6DOF consistency evaluator parameters */
  consistency: ConsistencyConfig;
}

// ---------------------------------------------------------------------------
// BM Profile — Ballistic Missiles
// ---------------------------------------------------------------------------

export const BM_PROFILE: CategoryProfile = {
  correlator: {
    // Wide spatial gate: BMs move 1000–2500 m between observations,
    // need large gate to prevent ghost track creation.
    // Multi-scenario optimized: 35 (from 50) — tighter prevents ghost tracks
    // in saturation scenarios while still wide enough for single BM.
    gateThreshold: 35.0,
    // Very high velocity gate: BM speeds are 700–2500 m/s.
    // Optimized to 450 across ballistic + grad-barrage + combined scenarios.
    velocityGateThreshold: 450,
  },

  // Immediate confirmation: BM/rocket transits are very short (10–120s),
  // even 2 updates can be too slow for 60s grad barrage.
  // Multi-scenario optimized: 1 (from 2).
  confirmAfter: 1,
  // Quick drop: if we lose a BM for 7 consecutive misses,
  // it's likely left the engagement zone.
  // Optimized: 7 (from 4) — grad-barrage rockets can briefly be occluded.
  dropAfterMisses: 7,
  // Very high pDetection + very low false alarm (BMs are strong returns)
  pDetection: 0.99,
  pFalseAlarm: 0.005,
  // Fast existence promotion/confirmation
  existencePromotionThreshold: 0.3,
  existenceConfirmationThreshold: 0.7,
  existenceDeletionThreshold: 0.23,
  // Short coasting: BMs don't loiter; missing means gone
  coastingMissThreshold: 2,
  maxCoastingTimeSec: 9,

  consistency: {
    // Very wide position gate: rockets traverse km/s, prediction errors
    // are proportionally larger. Optimized: 4400m across BM scenarios.
    positionGateM: 4400,
    // Very wide velocity gate: BM acceleration during boost phase
    // causes large velocity changes. Optimized: 450 m/s.
    velocityGateMps: 450,
    // Wide acceleration gate: boost/burnout/reentry cause high accel
    accelerationGateMps2: 80,
    // Doppler gate: large radial velocity changes expected. Optimized: 290.
    dopplerGateMps: 290,
    // Aggressive boost: fast confirmation is critical for threat response
    consistentBoost: 0.14,
    inconsistentDecay: -0.13,
    maxDeltaPerUpdate: 0.22,
    // Quick streak: fewer consistent updates needed for bonus
    streakBonusAfter: 2,
    streakBonusMultiplier: 2.0,
  },
};

// ---------------------------------------------------------------------------
// ABT Profile — Air-Breathing Targets (drones, cruise missiles, aircraft)
// ---------------------------------------------------------------------------

export const ABT_PROFILE: CategoryProfile = {
  correlator: {
    // Tight spatial gate: ABTs move slowly, tight gating prevents ghost tracks.
    // Multi-scenario optimized: 14 (from 22) — tighter works well across
    // 8 ABT scenarios including crossed-tracks and drone-swarm.
    gateThreshold: 14.0,
    // Standard velocity gate: ABT speeds are 44–260 m/s
    velocityGateThreshold: 80,
  },

  // Moderate confirmation: ABTs are in coverage longer, can afford more updates.
  // Optimized: 4 (from 3) — reduces false confirmations in clutter.
  confirmAfter: 4,
  // Generous drop: slow ABTs may temporarily exit coverage and return.
  // Optimized: 11 (from 10).
  dropAfterMisses: 11,
  pDetection: 0.91,
  pFalseAlarm: 0.035,
  existencePromotionThreshold: 0.7,
  existenceConfirmationThreshold: 0.95,
  existenceDeletionThreshold: 0.12,
  // Longer coasting: ABTs loiter, may have intermittent radar returns
  coastingMissThreshold: 3,
  maxCoastingTimeSec: 28,

  consistency: {
    // Moderate position gate: optimized across 8 ABT scenarios.
    // 1150m (from 600m) — drone-swarm and crossed-tracks need more room.
    positionGateM: 1150,
    // Tight velocity gate: ABT speed changes are gradual (turns, not thrust)
    velocityGateMps: 45,
    // Tight acceleration gate: coordinated turns only ~1g
    accelerationGateMps2: 10,
    // Standard Doppler gate
    dopplerGateMps: 45,
    // Standard boost/decay rates
    consistentBoost: 0.02,
    inconsistentDecay: -0.10,
    maxDeltaPerUpdate: 0.23,
    streakBonusAfter: 4,
    streakBonusMultiplier: 2.0,
  },
};

// ---------------------------------------------------------------------------
// Default (unresolved) profile — used while both hypotheses compete
// ---------------------------------------------------------------------------

export const DEFAULT_PROFILE: CategoryProfile = {
  correlator: {
    // Moderate gate: wide enough for both BM and ABT initial detection.
    // Widened from 16→22 and 50→100 to reduce ghost track proliferation
    // for unresolved targets before category classification.
    gateThreshold: 22.0,
    velocityGateThreshold: 100,
  },

  confirmAfter: 4,
  dropAfterMisses: 13,
  pDetection: 0.95,
  pFalseAlarm: 0.061,
  existencePromotionThreshold: 0.35,
  existenceConfirmationThreshold: 0.85,
  existenceDeletionThreshold: 0.17,
  coastingMissThreshold: 4,
  maxCoastingTimeSec: 25,

  consistency: {
    positionGateM: 1000,
    velocityGateMps: 50,
    accelerationGateMps2: 15,
    dopplerGateMps: 45,
    consistentBoost: 0.03,
    inconsistentDecay: -0.10,
    maxDeltaPerUpdate: 0.15,
    streakBonusAfter: 3,
    streakBonusMultiplier: 2.0,
  },
};

// ---------------------------------------------------------------------------
// Profile lookup
// ---------------------------------------------------------------------------

export function getProfile(category: TargetCategory): CategoryProfile {
  switch (category) {
    case 'bm': return BM_PROFILE;
    case 'abt': return ABT_PROFILE;
    case 'unresolved': return DEFAULT_PROFILE;
  }
}

// ---------------------------------------------------------------------------
// Velocity/Trajectory Classifier
// ---------------------------------------------------------------------------

/**
 * Classification thresholds for distinguishing BM from ABT.
 * Uses speed + climb angle as the primary discriminators.
 *
 * BM indicators: speed > 500 m/s OR climb angle > 30°
 * ABT indicators: speed < 350 m/s AND |climb angle| < 20°
 *
 * Unresolved zone: 350–500 m/s with moderate climb (some cruise missiles)
 */
export interface ClassifierState {
  /** Running BM likelihood [0, 1] */
  bmScore: number;
  /** Running ABT likelihood [0, 1] */
  abtScore: number;
  /** Number of observations used for classification */
  observationCount: number;
  /** Resolved category (null until confident) */
  resolved: TargetCategory;
}

/** Speed threshold above which target is very likely BM (m/s) */
const BM_SPEED_HIGH = 500;
/** Speed below which target is very likely ABT (m/s) */
const ABT_SPEED_LOW = 350;
/** Climb angle above which target is likely BM (degrees) */
const BM_CLIMB_ANGLE = 30;
/** Min observations before we can resolve */
const MIN_OBS_TO_RESOLVE = 2;
/** Confidence threshold to commit to a category */
const RESOLVE_THRESHOLD = 0.7;

export function createClassifierState(): ClassifierState {
  return { bmScore: 0.5, abtScore: 0.5, observationCount: 0, resolved: 'unresolved' };
}

/**
 * Update classifier state with a new observation.
 * Returns the updated state with potentially resolved category.
 *
 * @param state Current classifier state
 * @param speed Total speed (m/s): sqrt(vx² + vy² + vz²)
 * @param climbAngleDeg Climb angle in degrees: atan2(vz, horizontal_speed)
 * @param accelerationMps2 Observed acceleration magnitude (optional)
 */
export function updateClassifier(
  state: ClassifierState,
  speed: number,
  climbAngleDeg: number,
  accelerationMps2?: number,
): ClassifierState {
  if (state.resolved !== 'unresolved') return state; // already committed

  const next = { ...state, observationCount: state.observationCount + 1 };

  // Exponential moving average factor
  const alpha = 0.4;

  // Speed evidence
  let bmEvidence = 0.5;
  if (speed > BM_SPEED_HIGH) {
    bmEvidence = 0.95; // very strong BM
  } else if (speed > ABT_SPEED_LOW) {
    // Ambiguous zone: linear interpolation
    bmEvidence = 0.5 + 0.45 * (speed - ABT_SPEED_LOW) / (BM_SPEED_HIGH - ABT_SPEED_LOW);
  } else {
    bmEvidence = 0.1; // very strong ABT
  }

  // Climb angle evidence (BMs climb steeply during boost)
  const absClimb = Math.abs(climbAngleDeg);
  if (absClimb > BM_CLIMB_ANGLE) {
    bmEvidence = Math.max(bmEvidence, 0.85);
  } else if (absClimb < 10) {
    bmEvidence = Math.min(bmEvidence, 0.3);
  }

  // Acceleration evidence (BMs have high accel during boost)
  if (accelerationMps2 !== undefined && accelerationMps2 > 20) {
    bmEvidence = Math.max(bmEvidence, 0.8);
  }

  // Update scores via EMA
  next.bmScore = (1 - alpha) * state.bmScore + alpha * bmEvidence;
  next.abtScore = 1 - next.bmScore;

  // Resolve if confident enough and enough observations
  if (next.observationCount >= MIN_OBS_TO_RESOLVE) {
    if (next.bmScore >= RESOLVE_THRESHOLD) {
      next.resolved = 'bm';
    } else if (next.abtScore >= RESOLVE_THRESHOLD) {
      next.resolved = 'abt';
    }
  }

  return next;
}
