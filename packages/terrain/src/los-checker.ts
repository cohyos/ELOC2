/**
 * Line-of-Sight (LOS) checker using SRTM DEM elevation data.
 *
 * Ray-marches along the great-circle path between a sensor and a target,
 * sampling terrain elevation at regular intervals and checking whether any
 * terrain point occludes the straight line between the two endpoints
 * (accounting for Earth curvature via a parabolic approximation).
 *
 * When no DEM data is loaded the checker gracefully degrades and always
 * returns `{ visible: true }`.
 */

import { getElevation, isLoaded } from './dem-loader.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mean Earth radius in metres (WGS-84 volumetric). */
const EARTH_RADIUS_M = 6_371_000;

/** Degrees ↔ radians helpers. */
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Default sampling interval along the ray (metres). */
const DEFAULT_STEP_M = 100;

/** Default sensor mast / antenna height above ground (metres). */
const DEFAULT_SENSOR_HEIGHT_M = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Position3D {
  lat: number;
  lon: number;
  /** Altitude / elevation in metres above mean sea level. */
  alt: number;
}

export interface LosResult {
  /** `true` when the target is geometrically visible from the sensor. */
  visible: boolean;
  /** The terrain point that blocks the LOS (only set when `visible` is false). */
  blockingPoint?: { lat: number; lon: number; elevationM: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the great-circle distance between two points (metres).
 */
function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Return an intermediate point along the great circle from (lat1,lon1) to
 * (lat2,lon2) at fractional distance `f` (0 = start, 1 = end).
 *
 * Uses the standard spherical interpolation formula.
 */
function intermediatePoint(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  f: number,
): { lat: number; lon: number } {
  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const lam2 = lon2 * DEG2RAD;

  const dPhi = phi2 - phi1;
  const dLam = lam2 - lam1;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (delta < 1e-12) {
    return { lat: lat1, lon: lon1 };
  }

  const sinDelta = Math.sin(delta);
  const A = Math.sin((1 - f) * delta) / sinDelta;
  const B = Math.sin(f * delta) / sinDelta;

  const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
  const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD2DEG,
    lon: Math.atan2(y, x) * RAD2DEG,
  };
}

/**
 * Earth-curvature correction: the amount (metres) by which the surface drops
 * below a geometric straight line at distance `d` from the observer over a
 * total path of length `D`. This is a standard parabolic approximation:
 *
 *   drop(d) ≈ d * (D - d) / (2 * R)
 *
 * The LOS line between sensor and target is "straight" in 3-D space while the
 * surface curves away beneath it. At sample point distance `d` from the
 * sensor, the surface is `drop(d)` metres lower than the chord would suggest.
 *
 * Equivalently, we can raise the LOS line altitude at the sample point by
 * this amount and compare against terrain.
 */
function earthCurvatureDrop(d: number, D: number): number {
  return (d * (D - d)) / (2 * EARTH_RADIUS_M);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check line-of-sight between a sensor and a target position.
 *
 * If no DEM tiles are loaded the function returns `{ visible: true }` so that
 * the simulation degrades gracefully.
 *
 * @param sensorPos   Sensor geodetic position (lat/lon/alt MSL).
 * @param targetPos   Target geodetic position (lat/lon/alt MSL).
 * @param sensorHeightM  Additional height above ground for the sensor
 *                        antenna/mast (default 10 m).
 * @param stepM       Sampling interval along the ray (default 100 m).
 */
export function checkLineOfSight(
  sensorPos: Position3D,
  targetPos: Position3D,
  sensorHeightM: number = DEFAULT_SENSOR_HEIGHT_M,
  stepM: number = DEFAULT_STEP_M,
): LosResult {
  // Graceful degradation — no DEM loaded.
  if (!isLoaded()) {
    return { visible: true };
  }

  const totalDist = haversineM(sensorPos.lat, sensorPos.lon, targetPos.lat, targetPos.lon);

  // If sensor and target are essentially co-located, LOS is trivially clear.
  if (totalDist < stepM) {
    return { visible: true };
  }

  // Effective altitudes: sensor gets extra mast height.
  const sensorAlt = sensorPos.alt + sensorHeightM;
  const targetAlt = targetPos.alt;

  const nSteps = Math.ceil(totalDist / stepM);
  const actualStep = totalDist / nSteps;

  for (let i = 1; i < nSteps; i++) {
    const f = i / nSteps; // fractional distance along path
    const d = i * actualStep; // metres from sensor

    const pt = intermediatePoint(
      sensorPos.lat, sensorPos.lon,
      targetPos.lat, targetPos.lon,
      f,
    );

    const terrainElev = getElevation(pt.lat, pt.lon);
    if (terrainElev === undefined) {
      // No data at this point — assume flat / transparent (graceful).
      continue;
    }

    // Altitude of the LOS line at this distance (linear interpolation
    // between sensor and target altitudes).
    const losAltAtD = sensorAlt + (targetAlt - sensorAlt) * f;

    // Correct for Earth curvature: the surface drops away, so the LOS line
    // is effectively *higher* relative to the local surface by the
    // curvature correction amount.
    const curvatureDrop = earthCurvatureDrop(d, totalDist);
    const effectiveLosAlt = losAltAtD + curvatureDrop;

    if (terrainElev > effectiveLosAlt) {
      return {
        visible: false,
        blockingPoint: {
          lat: pt.lat,
          lon: pt.lon,
          elevationM: terrainElev,
        },
      };
    }
  }

  return { visible: true };
}
