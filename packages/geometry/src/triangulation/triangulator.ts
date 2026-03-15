/**
 * Triangulation algorithms for EO sensor bearing intersection.
 *
 * Supports 2-bearing closest-point-of-approach and multi-bearing
 * weighted-average triangulation.
 */

import type { BearingMeasurement, Position3D } from '@eloc2/domain';
import { geodeticToENU, enuToGeodetic } from '@eloc2/shared-utils';
import {
  computeBearingRay,
  intersectRays,
  type Ray3D,
  type RayIntersectionResult,
} from '../bearings/bearing-math.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a triangulation computation. */
export interface TriangulationResult {
  /** Estimated position in geodetic coordinates. */
  position: Position3D;
  /** Estimated position in ENU relative to the reference. */
  positionENU: { east: number; north: number; up: number };
  /** Best (maximum) intersection angle among all pairs in degrees. */
  intersectionAngleDeg: number;
  /** Average miss distance across all pairwise intersections in meters. */
  averageMissDistance: number;
  /** Number of bearings used. */
  numBearings: number;
  /** Residual covariance in ENU frame (meters^2). */
  residualCovariance: number[][] | undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Triangulate a target position from exactly two bearing measurements.
 *
 * Uses the closest-point-of-approach between two 3-D rays and returns
 * the midpoint as the estimated position.
 */
export function triangulateTwoBearings(
  sensor1Pos: Position3D,
  bearing1: BearingMeasurement,
  sensor2Pos: Position3D,
  bearing2: BearingMeasurement,
): TriangulationResult {
  // Use first sensor as ENU reference
  const refPos = sensor1Pos;

  const ray1 = computeBearingRay(sensor1Pos, bearing1, refPos);
  const ray2 = computeBearingRay(sensor2Pos, bearing2, refPos);

  const intersection = intersectRays(ray1, ray2);

  // Convert midpoint back to geodetic
  const geo = enuToGeodetic(
    intersection.midpoint.east,
    intersection.midpoint.north,
    intersection.midpoint.up,
    refPos.lat,
    refPos.lon,
    refPos.alt,
  );

  return {
    position: { lat: geo.lat, lon: geo.lon, alt: geo.alt },
    positionENU: intersection.midpoint,
    intersectionAngleDeg: intersection.intersectionAngleDeg,
    averageMissDistance: intersection.missDistance,
    numBearings: 2,
    residualCovariance: undefined,
  };
}

/**
 * Triangulate a target position from 3 or more bearing measurements.
 *
 * Performs all pairwise intersections and computes a weighted average
 * of the midpoints, weighting each pair by `1 / (missDistance + epsilon)`
 * to favor well-intersecting pairs. Also computes residual covariance
 * from the spread of pairwise estimates.
 */
export function triangulateMultiple(
  sensorPositions: Position3D[],
  bearings: BearingMeasurement[],
): TriangulationResult {
  if (sensorPositions.length < 2 || bearings.length < 2) {
    throw new Error('At least 2 bearings are required for triangulation');
  }

  if (sensorPositions.length !== bearings.length) {
    throw new Error('sensorPositions and bearings must have equal length');
  }

  if (sensorPositions.length === 2) {
    return triangulateTwoBearings(
      sensorPositions[0],
      bearings[0],
      sensorPositions[1],
      bearings[1],
    );
  }

  // Use centroid of sensors as ENU reference
  const refPos: Position3D = {
    lat: sensorPositions.reduce((s, p) => s + p.lat, 0) / sensorPositions.length,
    lon: sensorPositions.reduce((s, p) => s + p.lon, 0) / sensorPositions.length,
    alt: sensorPositions.reduce((s, p) => s + p.alt, 0) / sensorPositions.length,
  };

  // Compute all rays in the common ENU frame
  const rays: Ray3D[] = sensorPositions.map((pos, i) =>
    computeBearingRay(pos, bearings[i], refPos),
  );

  // Pairwise intersections
  const pairResults: Array<{
    intersection: RayIntersectionResult;
    i: number;
    j: number;
  }> = [];

  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const intersection = intersectRays(rays[i], rays[j]);
      // Only include pairs where both t parameters are positive (target is in front of sensors)
      if (intersection.t1 > 0 && intersection.t2 > 0) {
        pairResults.push({ intersection, i, j });
      }
    }
  }

  // If no valid pairs, fall back to all pairs without t-filtering
  if (pairResults.length === 0) {
    for (let i = 0; i < rays.length; i++) {
      for (let j = i + 1; j < rays.length; j++) {
        const intersection = intersectRays(rays[i], rays[j]);
        pairResults.push({ intersection, i, j });
      }
    }
  }

  // Weighted average of midpoints (weight = 1 / (missDistance + epsilon))
  const epsilon = 1.0; // 1 meter to avoid division by zero
  let totalWeight = 0;
  let weightedEast = 0;
  let weightedNorth = 0;
  let weightedUp = 0;
  let bestAngle = 0;
  let totalMissDistance = 0;

  for (const { intersection } of pairResults) {
    const weight = 1.0 / (intersection.missDistance + epsilon);
    totalWeight += weight;
    weightedEast += weight * intersection.midpoint.east;
    weightedNorth += weight * intersection.midpoint.north;
    weightedUp += weight * intersection.midpoint.up;
    totalMissDistance += intersection.missDistance;

    if (intersection.intersectionAngleDeg > bestAngle) {
      bestAngle = intersection.intersectionAngleDeg;
    }
  }

  const avgEast = weightedEast / totalWeight;
  const avgNorth = weightedNorth / totalWeight;
  const avgUp = weightedUp / totalWeight;
  const avgMissDistance = totalMissDistance / pairResults.length;

  // Residual covariance from scatter of pairwise estimates
  const residualCovariance = computeResidualCovariance(
    pairResults.map((p) => p.intersection.midpoint),
    { east: avgEast, north: avgNorth, up: avgUp },
  );

  // Convert back to geodetic
  const geo = enuToGeodetic(avgEast, avgNorth, avgUp, refPos.lat, refPos.lon, refPos.alt);

  return {
    position: { lat: geo.lat, lon: geo.lon, alt: geo.alt },
    positionENU: { east: avgEast, north: avgNorth, up: avgUp },
    intersectionAngleDeg: bestAngle,
    averageMissDistance: avgMissDistance,
    numBearings: bearings.length,
    residualCovariance,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute residual covariance from the scatter of pairwise midpoints
 * around their weighted mean.
 */
function computeResidualCovariance(
  points: Array<{ east: number; north: number; up: number }>,
  mean: { east: number; north: number; up: number },
): number[][] {
  const n = points.length;
  if (n < 2) {
    return [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  }

  // Initialize 3x3 covariance matrix
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const p of points) {
    const de = p.east - mean.east;
    const dn = p.north - mean.north;
    const du = p.up - mean.up;

    cov[0][0] += de * de;
    cov[0][1] += de * dn;
    cov[0][2] += de * du;
    cov[1][0] += dn * de;
    cov[1][1] += dn * dn;
    cov[1][2] += dn * du;
    cov[2][0] += du * de;
    cov[2][1] += du * dn;
    cov[2][2] += du * du;
  }

  // Normalize by (n - 1) for sample covariance
  const scale = 1 / (n - 1);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      cov[i][j] *= scale;
    }
  }

  return cov;
}
