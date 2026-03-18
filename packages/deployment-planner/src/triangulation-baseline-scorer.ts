/**
 * Triangulation baseline quality scorer.
 * Evaluates sensor placement based on baseline distance and angular
 * diversity between EO sensor pairs for triangulation quality.
 *
 * Ideal baseline: 5-20km apart (too close = poor angular resolution,
 * too far = timing synchronization issues).
 * Ideal angular separation: 60-120 degrees to target areas.
 */
import type { GeoPoint, PlacedSensor, GridCell, SensorSpec } from './types.js';
import { haversineDistance } from './grid.js';

/** Ideal baseline range in meters. */
const MIN_BASELINE_M = 5_000;
const MAX_BASELINE_M = 20_000;
const IDEAL_BASELINE_M = 12_000; // Midpoint of ideal range

/** Ideal angular separation range in degrees. */
const MIN_ANGLE_DEG = 60;
const MAX_ANGLE_DEG = 120;
const IDEAL_ANGLE_DEG = 90; // Midpoint of ideal range

/**
 * Compute azimuth from point A to point B in degrees [0, 360).
 */
function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Score the baseline distance between two sensors.
 * Returns 1.0 when distance is at the ideal midpoint (12km),
 * tapers to 0 outside the 5-20km range.
 *
 * Uses a Gaussian-like falloff centered on the ideal baseline.
 */
function baselineDistanceScore(distanceM: number): number {
  if (distanceM <= 0) return 0;

  if (distanceM >= MIN_BASELINE_M && distanceM <= MAX_BASELINE_M) {
    // Within ideal range: score based on proximity to midpoint
    const deviation = Math.abs(distanceM - IDEAL_BASELINE_M);
    const halfRange = (MAX_BASELINE_M - MIN_BASELINE_M) / 2;
    return 1.0 - 0.3 * (deviation / halfRange); // 0.7 - 1.0 within ideal range
  }

  // Outside ideal range: exponential decay
  if (distanceM < MIN_BASELINE_M) {
    return Math.exp(-((MIN_BASELINE_M - distanceM) / MIN_BASELINE_M) * 3);
  }

  // distanceM > MAX_BASELINE_M
  return Math.exp(-((distanceM - MAX_BASELINE_M) / MAX_BASELINE_M) * 3);
}

/**
 * Score the angular separation between two sensors relative to a target cell.
 * Returns 1.0 when the angular separation is at the ideal 90 degrees,
 * high scores (0.7+) in the 60-120 degree range, tapering outside.
 */
function angularSeparationScore(sensorA: GeoPoint, sensorB: GeoPoint, target: GeoPoint): number {
  const bearA = bearingDeg(target, sensorA);
  const bearB = bearingDeg(target, sensorB);

  let diff = Math.abs(bearA - bearB);
  if (diff > 180) diff = 360 - diff;

  if (diff >= MIN_ANGLE_DEG && diff <= MAX_ANGLE_DEG) {
    // Within ideal range
    const deviation = Math.abs(diff - IDEAL_ANGLE_DEG);
    const halfRange = (MAX_ANGLE_DEG - MIN_ANGLE_DEG) / 2;
    return 1.0 - 0.3 * (deviation / halfRange); // 0.7 - 1.0 within ideal range
  }

  // Outside ideal range: smooth falloff using sin
  // Near-parallel (0-60): poor geometry
  if (diff < MIN_ANGLE_DEG) {
    return 0.7 * Math.sin((diff / MIN_ANGLE_DEG) * (Math.PI / 2));
  }

  // Near-antiparallel (120-180): ambiguous but possible
  return 0.7 * Math.sin(((180 - diff) / (180 - MAX_ANGLE_DEG)) * (Math.PI / 2));
}

/**
 * Compute triangulation baseline score for placing an EO sensor at candidatePos,
 * considering already-placed EO sensors.
 *
 * For each placed EO sensor, evaluates:
 *   1. Baseline distance quality (ideal 5-20km)
 *   2. Angular diversity across grid cells (ideal 60-120 degrees)
 *
 * The combined score is the average of (baseline * angular) across all
 * EO sensor pairs and sampled grid cells.
 *
 * @param candidatePos - Where to place the sensor.
 * @param sensor - Sensor specification (only scored for EO sensors).
 * @param cells - All grid cells (target area).
 * @param placedSensors - Already-placed sensors.
 * @returns Score between 0 and 1.
 */
export function triangulationBaselineScore(
  candidatePos: GeoPoint,
  sensor: SensorSpec,
  cells: GridCell[],
  placedSensors: PlacedSensor[],
): number {
  // Only score EO sensors
  if (sensor.type !== 'eo') return 0;

  // Need at least one already-placed EO sensor
  const placedEo = placedSensors.filter((s) => s.spec.type === 'eo');
  if (placedEo.length === 0 || cells.length === 0) return 0;

  let totalScore = 0;
  let pairCount = 0;

  for (const placed of placedEo) {
    const baseline = haversineDistance(candidatePos, placed.position);
    const bScore = baselineDistanceScore(baseline);

    // Skip pairs with terrible baseline (not worth evaluating angles)
    if (bScore < 0.01) continue;

    // Sample angular quality across grid cells within range of both sensors
    let angularSum = 0;
    let cellCount = 0;

    for (const cell of cells) {
      const distCandidate = haversineDistance(candidatePos, cell.center);
      const distPlaced = haversineDistance(placed.position, cell.center);

      // Only score cells within range of both sensors
      if (distCandidate > sensor.maxRangeM || distPlaced > placed.spec.maxRangeM) continue;

      angularSum += angularSeparationScore(candidatePos, placed.position, cell.center);
      cellCount++;
    }

    if (cellCount > 0) {
      const avgAngular = angularSum / cellCount;
      // Combined score: baseline quality * angular quality
      totalScore += bScore * avgAngular;
      pairCount++;
    }
  }

  return pairCount > 0 ? totalScore / pairCount : 0;
}
