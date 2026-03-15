/**
 * Quality scoring and geometry classification for triangulation results.
 *
 * Quality thresholds:
 *   <10deg  -> insufficient
 *   <30deg  -> weak
 *   <60deg  -> acceptable
 *   >=60deg -> strong
 *
 * Classification:
 *   bearing_only  -> insufficient quality
 *   candidate_3d  -> weak/acceptable quality with 2 bearings
 *   confirmed_3d  -> strong quality OR acceptable+ with 3+ bearings
 *
 * Design decision #10: NEVER present weak geometry as confirmed_3d.
 */

import type { Covariance3x3, GeometryClass, GeometryQuality } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Quality thresholds (degrees)
// ---------------------------------------------------------------------------

const THRESHOLD_INSUFFICIENT = 10;
const THRESHOLD_WEAK = 30;
const THRESHOLD_ACCEPTABLE = 60;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score the geometry quality based on the intersection angle.
 */
export function scoreQuality(intersectionAngleDeg: number): GeometryQuality {
  if (intersectionAngleDeg < THRESHOLD_INSUFFICIENT) return 'insufficient';
  if (intersectionAngleDeg < THRESHOLD_WEAK) return 'weak';
  if (intersectionAngleDeg < THRESHOLD_ACCEPTABLE) return 'acceptable';
  return 'strong';
}

/**
 * Classify the geometry type based on quality, number of bearings,
 * and optionally the covariance volume.
 *
 * Rules:
 *   - insufficient quality -> bearing_only (regardless of bearing count)
 *   - weak quality with any number of bearings -> candidate_3d (NEVER confirmed_3d)
 *   - acceptable quality with 2 bearings -> candidate_3d
 *   - acceptable quality with 3+ bearings -> confirmed_3d
 *   - strong quality -> confirmed_3d
 */
export function classifyGeometry(
  quality: GeometryQuality,
  numBearings: number,
  _covarianceVolume?: number,
): GeometryClass {
  if (quality === 'insufficient') {
    return 'bearing_only';
  }

  if (quality === 'weak') {
    // Design decision #10: NEVER present weak geometry as confirmed_3d
    return 'candidate_3d';
  }

  if (quality === 'acceptable') {
    return numBearings >= 3 ? 'confirmed_3d' : 'candidate_3d';
  }

  // strong quality
  return 'confirmed_3d';
}

/**
 * Estimate a simplified analytical covariance based on intersection geometry.
 *
 * The cross-range error grows with range/sin(angle) and the along-range error
 * grows with range/tan(angle). This is a simplified model assuming isotropic
 * bearing noise.
 *
 * @param intersectionAngleDeg  Intersection angle in degrees.
 * @param baselineM  Distance between sensors in meters.
 * @param bearingNoiseDeg  Bearing measurement noise (1-sigma) in degrees.
 * @returns A 3x3 covariance matrix in ENU frame (meters^2).
 */
export function estimateCovariance(
  intersectionAngleDeg: number,
  baselineM: number,
  bearingNoiseDeg: number,
): Covariance3x3 {
  const angleRad = intersectionAngleDeg * (Math.PI / 180);
  const noiseRad = bearingNoiseDeg * (Math.PI / 180);

  // Avoid division by zero for near-parallel bearings
  const sinAngle = Math.max(Math.sin(angleRad), 0.01);

  // Range estimate (approximate) from baseline and intersection geometry
  // For a typical triangulation, range ~ baseline / (2 * sin(angle/2))
  const range = baselineM / (2 * Math.sin(Math.max(angleRad / 2, 0.01)));

  // Cross-range variance: (range * bearingNoise)^2
  const crossRangeVar = (range * noiseRad) ** 2;

  // Along-range variance: (range * bearingNoise / sin(angle))^2
  const alongRangeVar = (range * noiseRad / sinAngle) ** 2;

  // Vertical variance (elevation uncertainty typically larger)
  const verticalVar = crossRangeVar * 2;

  // Return diagonal covariance (simplified — ignores cross-correlations)
  return [
    [crossRangeVar, 0, 0],
    [0, alongRangeVar, 0],
    [0, 0, verticalVar],
  ];
}
