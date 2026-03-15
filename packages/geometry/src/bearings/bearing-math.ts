/**
 * Bearing ray computation and intersection for EO sensor triangulation.
 *
 * All geometric computations are performed in the ENU (East-North-Up)
 * coordinate frame relative to a chosen reference point.
 */

import type { BearingMeasurement, Position3D } from '@eloc2/domain';
import { DEG_TO_RAD, RAD_TO_DEG, geodeticToENU } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A 3-D ray defined by an origin point and a unit direction vector. */
export interface Ray3D {
  origin: { east: number; north: number; up: number };
  direction: { east: number; north: number; up: number };
}

/** Result of intersecting two 3-D rays (closest point of approach). */
export interface RayIntersectionResult {
  /** Midpoint of the closest approach segment (ENU). */
  midpoint: { east: number; north: number; up: number };
  /** Distance between the two closest points on each ray. */
  missDistance: number;
  /** Angle between the two direction vectors in degrees. */
  intersectionAngleDeg: number;
  /** Parameter t along ray1 at the closest point. */
  t1: number;
  /** Parameter t along ray2 at the closest point. */
  t2: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a 3-D bearing ray from a sensor position and an angular measurement.
 *
 * The azimuth is measured clockwise from North and the elevation is measured
 * up from the horizontal plane. The resulting direction vector is a unit vector
 * in the ENU frame centered at `refPos`.
 *
 * @param sensorPos  Geodetic position of the sensor.
 * @param measurement  Bearing measurement (azimuth + elevation).
 * @param refPos  Reference position for the ENU frame (typically first sensor).
 */
export function computeBearingRay(
  sensorPos: Position3D,
  measurement: BearingMeasurement,
  refPos: Position3D,
): Ray3D {
  const origin = geodeticToENU(
    sensorPos.lat,
    sensorPos.lon,
    sensorPos.alt,
    refPos.lat,
    refPos.lon,
    refPos.alt,
  );

  const azRad = measurement.azimuthDeg * DEG_TO_RAD;
  const elRad = measurement.elevationDeg * DEG_TO_RAD;

  const cosEl = Math.cos(elRad);

  // Azimuth: 0 = North (positive north), clockwise → positive east
  const direction = {
    east: cosEl * Math.sin(azRad),
    north: cosEl * Math.cos(azRad),
    up: Math.sin(elRad),
  };

  return { origin, direction };
}

/**
 * Closest point of approach between two 3-D rays.
 *
 * Uses the standard analytical CPA formula:
 *   P1(t1) = o1 + t1 * d1
 *   P2(t2) = o2 + t2 * d2
 *
 * Returns the midpoint, miss distance, and intersection angle.
 */
export function intersectRays(ray1: Ray3D, ray2: Ray3D): RayIntersectionResult {
  const d1 = ray1.direction;
  const d2 = ray2.direction;
  const o1 = ray1.origin;
  const o2 = ray2.origin;

  // w = o1 - o2
  const w = {
    east: o1.east - o2.east,
    north: o1.north - o2.north,
    up: o1.up - o2.up,
  };

  const a = dot(d1, d1); // always 1 if unit vectors
  const b = dot(d1, d2);
  const c = dot(d2, d2); // always 1 if unit vectors
  const d = dot(d1, w);
  const e = dot(d2, w);

  const denom = a * c - b * b;

  let t1: number;
  let t2: number;

  if (Math.abs(denom) < 1e-12) {
    // Rays are effectively parallel
    t1 = 0;
    t2 = e / c;
  } else {
    t1 = (b * e - c * d) / denom;
    t2 = (a * e - b * d) / denom;
  }

  // Closest points
  const p1 = {
    east: o1.east + t1 * d1.east,
    north: o1.north + t1 * d1.north,
    up: o1.up + t1 * d1.up,
  };

  const p2 = {
    east: o2.east + t2 * d2.east,
    north: o2.north + t2 * d2.north,
    up: o2.up + t2 * d2.up,
  };

  const midpoint = {
    east: (p1.east + p2.east) / 2,
    north: (p1.north + p2.north) / 2,
    up: (p1.up + p2.up) / 2,
  };

  const missDistance = Math.sqrt(
    (p1.east - p2.east) ** 2 +
    (p1.north - p2.north) ** 2 +
    (p1.up - p2.up) ** 2,
  );

  const intersectionAngleDeg = computeIntersectionAngle(d1, d2);

  return { midpoint, missDistance, intersectionAngleDeg, t1, t2 };
}

/**
 * Compute the acute angle between two direction vectors in degrees.
 */
export function computeIntersectionAngle(
  dir1: { east: number; north: number; up: number },
  dir2: { east: number; north: number; up: number },
): number {
  const dotVal = dot(dir1, dir2);
  const mag1 = magnitude(dir1);
  const mag2 = magnitude(dir2);

  if (mag1 < 1e-15 || mag2 < 1e-15) return 0;

  // Clamp to [-1, 1] to handle numerical errors
  const cosAngle = Math.max(-1, Math.min(1, dotVal / (mag1 * mag2)));
  // Use abs(cosAngle) to always return the acute angle (0–90°) between rays.
  // For triangulation, we want the acute intersection angle because obtuse
  // crossings (>90°) are geometrically equivalent to their supplement.
  // However, for nearly anti-parallel rays the supplement should be near 0°
  // (poor geometry), so we use min(angle, 180 - angle).
  const rawAngleDeg = Math.acos(cosAngle) * RAD_TO_DEG;
  const angleDeg = rawAngleDeg > 90 ? 180 - rawAngleDeg : rawAngleDeg;

  return angleDeg;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dot(
  a: { east: number; north: number; up: number },
  b: { east: number; north: number; up: number },
): number {
  return a.east * b.east + a.north * b.north + a.up * b.up;
}

function magnitude(v: { east: number; north: number; up: number }): number {
  return Math.sqrt(v.east ** 2 + v.north ** 2 + v.up ** 2);
}
