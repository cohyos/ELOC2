/**
 * TrajectoryClassifier — system-level classification based on kinematic trajectory.
 *
 * Uses speed, altitude, climb angle, and flight profile to infer a
 * TargetClassification for system tracks.  This classifier runs at the
 * fusion level (after track-to-track correlation) and only applies to
 * tracks whose classification has NOT been set by an operator.
 *
 * Classification is always overridable — operator or EO identification
 * takes precedence.
 *
 * Trajectory profiles (typical values):
 *   Ballistic missile : speed >700 m/s, climb >30°, alt >30 km
 *   Rocket            : speed 300–700 m/s, climb >20°, alt 5–80 km
 *   Fighter aircraft  : speed 200–330 m/s, alt 5–15 km, moderate climb
 *   Helicopter        : speed 30–120 m/s, alt <3 km, low climb
 *   UAV / drone       : speed 20–80 m/s, alt 0.1–5 km
 *   Civilian aircraft : speed 180–260 m/s, alt 8–12 km, very low climb
 *   Predator (MALE UAV): speed 30–60 m/s, alt 5–8 km
 */

import type {
  TargetClassification,
  ClassificationSource,
  Velocity3D,
  Position3D,
} from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Trajectory Classification Result
// ---------------------------------------------------------------------------

export interface TrajectoryClassificationResult {
  classification: TargetClassification;
  confidence: number; // 0–1
  source: ClassificationSource;
  reason: string; // human-readable explanation
}

// ---------------------------------------------------------------------------
// Internal trajectory feature extraction
// ---------------------------------------------------------------------------

interface TrajectoryFeatures {
  speedMps: number;
  altitudeM: number;
  climbAngleDeg: number;
  horizontalSpeedMps: number;
  verticalSpeedMps: number;
}

function extractFeatures(
  position: Position3D,
  velocity: Velocity3D | undefined,
): TrajectoryFeatures | null {
  if (!velocity) return null;

  const vx = velocity.vx;
  const vy = velocity.vy;
  const vz = velocity.vz;
  const horizontalSpeedMps = Math.sqrt(vx * vx + vy * vy);
  const speedMps = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const climbAngleDeg =
    horizontalSpeedMps > 0.1
      ? Math.atan2(vz, horizontalSpeedMps) * (180 / Math.PI)
      : 0;

  return {
    speedMps,
    altitudeM: position.alt,
    climbAngleDeg,
    horizontalSpeedMps,
    verticalSpeedMps: vz,
  };
}

// ---------------------------------------------------------------------------
// Classification rules (ordered by specificity — first match wins)
// ---------------------------------------------------------------------------

interface ClassificationRule {
  classification: TargetClassification;
  minConfidence: number;
  match: (f: TrajectoryFeatures) => number; // returns confidence 0–1, 0 = no match
  reason: string;
}

const RULES: ClassificationRule[] = [
  // ── Ballistic Missile ──
  {
    classification: 'missile',
    minConfidence: 0.6,
    reason: 'Very high speed (>700 m/s) with steep climb',
    match: (f) => {
      if (f.speedMps > 700 && Math.abs(f.climbAngleDeg) > 20) return 0.95;
      if (f.speedMps > 700) return 0.80;
      if (f.speedMps > 500 && Math.abs(f.climbAngleDeg) > 30) return 0.75;
      return 0;
    },
  },

  // ── Rocket (sub-BM, e.g. Grad, short-range) ──
  {
    classification: 'rocket',
    minConfidence: 0.5,
    reason: 'Medium-high speed (300–700 m/s) with steep climb',
    match: (f) => {
      if (f.speedMps >= 300 && f.speedMps <= 700 && Math.abs(f.climbAngleDeg) > 20) return 0.85;
      if (f.speedMps >= 300 && f.speedMps <= 700 && f.altitudeM > 10_000) return 0.70;
      return 0;
    },
  },

  // ── Fighter aircraft ──
  {
    classification: 'fighter_aircraft',
    minConfidence: 0.5,
    reason: 'High speed (200–400 m/s), medium-high altitude',
    match: (f) => {
      if (f.speedMps >= 200 && f.speedMps <= 400 && f.altitudeM > 3_000 && Math.abs(f.climbAngleDeg) < 25) return 0.80;
      if (f.speedMps >= 150 && f.speedMps <= 400 && f.altitudeM > 5_000) return 0.65;
      return 0;
    },
  },

  // ── Civilian / passenger aircraft ──
  {
    classification: 'civilian_aircraft',
    minConfidence: 0.5,
    reason: 'Cruise speed (180–270 m/s), high altitude, level flight',
    match: (f) => {
      if (f.speedMps >= 180 && f.speedMps <= 270 && f.altitudeM > 7_000 && Math.abs(f.climbAngleDeg) < 8) return 0.85;
      if (f.speedMps >= 150 && f.speedMps <= 280 && f.altitudeM > 6_000 && Math.abs(f.climbAngleDeg) < 12) return 0.65;
      return 0;
    },
  },

  // ── Helicopter ──
  {
    classification: 'helicopter',
    minConfidence: 0.5,
    reason: 'Low speed (<150 m/s), low altitude (<3 km)',
    match: (f) => {
      if (f.speedMps < 150 && f.altitudeM < 3_000 && f.altitudeM > 10) return 0.80;
      if (f.speedMps < 120 && f.altitudeM < 4_000) return 0.60;
      return 0;
    },
  },

  // ── Predator / MALE UAV ──
  {
    classification: 'predator',
    minConfidence: 0.5,
    reason: 'Low speed (30–80 m/s), medium altitude (3–9 km), level flight',
    match: (f) => {
      if (f.speedMps >= 30 && f.speedMps <= 80 && f.altitudeM >= 3_000 && f.altitudeM <= 9_000 && Math.abs(f.climbAngleDeg) < 10) return 0.75;
      return 0;
    },
  },

  // ── Small UAV / drone ──
  {
    classification: 'drone',
    minConfidence: 0.5,
    reason: 'Very low speed (<80 m/s), low altitude',
    match: (f) => {
      if (f.speedMps < 80 && f.altitudeM < 3_000 && f.altitudeM > 5) return 0.75;
      if (f.speedMps < 60 && f.altitudeM < 5_000) return 0.60;
      return 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a system track based on its trajectory.
 * Returns null if trajectory is insufficient to classify.
 */
export function classifyByTrajectory(
  position: Position3D,
  velocity: Velocity3D | undefined,
): TrajectoryClassificationResult | null {
  const features = extractFeatures(position, velocity);
  if (!features) return null;

  // Skip if speed is too low to classify (essentially stationary)
  if (features.speedMps < 5) return null;

  let bestResult: TrajectoryClassificationResult | null = null;
  let bestConfidence = 0;

  for (const rule of RULES) {
    const confidence = rule.match(features);
    if (confidence >= rule.minConfidence && confidence > bestConfidence) {
      bestConfidence = confidence;
      bestResult = {
        classification: rule.classification,
        confidence,
        source: 'c4isr', // system-level auto-classification
        reason: rule.reason,
      };
    }
  }

  return bestResult;
}

/**
 * Check whether a track's classification should be overridden by the
 * trajectory classifier.  Returns true only if:
 * 1. No classification exists, OR
 * 2. Existing classification was auto-assigned (not operator/scenario)
 *    AND the new confidence is higher
 *
 * Operator and scenario classifications are NEVER overridden.
 */
export function shouldApplyTrajectoryClassification(
  existingClassification: TargetClassification | undefined,
  existingSource: ClassificationSource | undefined,
  existingConfidence: number | undefined,
  newConfidence: number,
): boolean {
  // No existing classification — always apply
  if (!existingClassification || existingClassification === 'unknown') {
    return true;
  }

  // Operator or scenario classification — never override
  if (existingSource === 'operator' || existingSource === 'scenario') {
    return false;
  }

  // Auto-assigned (c4isr, eo_identification) — override if higher confidence
  return newConfidence > (existingConfidence ?? 0);
}
