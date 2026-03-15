/**
 * WGS84 and coordinate conversion utilities.
 *
 * All public functions accept lat/lon in degrees and convert internally to radians.
 */

// ── WGS84 constants ──────────────────────────────────────────────────────────

/** Semi-major axis in meters. */
export const WGS84_A = 6_378_137.0;

/** Flattening. */
export const WGS84_F = 1 / 298.257223563;

/** First eccentricity squared. */
const E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

/** First eccentricity. */
export const WGS84_E = Math.sqrt(E2);

// ── Conversion helpers ───────────────────────────────────────────────────────

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/** Normalize an angle in degrees to the range [0, 360). */
export function clampAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalize longitude to the range (-180, 180]. */
export function normalizeLon(lon: number): number {
  const wrapped = ((lon + 180) % 360) - 180;
  // JS modulo can return -0 or -360 for exact multiples; clamp to -180 → 180
  return wrapped <= -180 ? wrapped + 360 : wrapped;
}

/**
 * Compute the shortest signed angle difference between two angles in degrees.
 * Result is in the range (-180, 180].
 *
 * Useful for azimuth delta calculations (gimbal slew, FOV containment).
 */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// ── Prime‑vertical radius of curvature ───────────────────────────────────────

function primeVerticalRadius(sinLat: number): number {
  return WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
}

// ── Geodetic ↔ ECEF ──────────────────────────────────────────────────────────

export interface ECEFCoord {
  x: number;
  y: number;
  z: number;
}

export interface GeodeticCoord {
  lat: number;
  lon: number;
  alt: number;
}

/**
 * Convert geodetic coordinates to ECEF.
 * @param lat Latitude in degrees.
 * @param lon Longitude in degrees.
 * @param alt Altitude in meters above the WGS84 ellipsoid.
 */
export function geodeticToECEF(lat: number, lon: number, alt: number): ECEFCoord {
  const latRad = lat * DEG_TO_RAD;
  const lonRad = lon * DEG_TO_RAD;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const N = primeVerticalRadius(sinLat);

  return {
    x: (N + alt) * cosLat * cosLon,
    y: (N + alt) * cosLat * sinLon,
    z: (N * (1 - E2) + alt) * sinLat,
  };
}

/**
 * Convert ECEF coordinates to geodetic (iterative Bowring method).
 * @returns lat/lon in degrees, alt in meters.
 */
export function ecefToGeodetic(x: number, y: number, z: number): GeodeticCoord {
  const lon = Math.atan2(y, x);

  const p = Math.sqrt(x * x + y * y);

  // Initial estimate using Bowring's method
  let lat = Math.atan2(z, p * (1 - E2));

  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const N = primeVerticalRadius(sinLat);
    lat = Math.atan2(z + E2 * N * sinLat, p);
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = primeVerticalRadius(sinLat);

  let alt: number;
  if (Math.abs(cosLat) > 1e-10) {
    alt = p / cosLat - N;
  } else {
    alt = Math.abs(z) / Math.abs(sinLat) - N * (1 - E2);
  }

  return {
    lat: lat * RAD_TO_DEG,
    lon: normalizeLon(lon * RAD_TO_DEG),
    alt,
  };
}

// ── Geodetic ↔ ENU ───────────────────────────────────────────────────────────

export interface ENUCoord {
  east: number;
  north: number;
  up: number;
}

/**
 * Convert a geodetic point to local East-North-Up coordinates relative to a
 * reference point.
 *
 * @param lat  Point latitude in degrees.
 * @param lon  Point longitude in degrees.
 * @param alt  Point altitude in meters.
 * @param refLat  Reference latitude in degrees.
 * @param refLon  Reference longitude in degrees.
 * @param refAlt  Reference altitude in meters.
 */
export function geodeticToENU(
  lat: number,
  lon: number,
  alt: number,
  refLat: number,
  refLon: number,
  refAlt: number,
): ENUCoord {
  const point = geodeticToECEF(lat, lon, alt);
  const ref = geodeticToECEF(refLat, refLon, refAlt);

  const dx = point.x - ref.x;
  const dy = point.y - ref.y;
  const dz = point.z - ref.z;

  const refLatRad = refLat * DEG_TO_RAD;
  const refLonRad = refLon * DEG_TO_RAD;

  const sinLat = Math.sin(refLatRad);
  const cosLat = Math.cos(refLatRad);
  const sinLon = Math.sin(refLonRad);
  const cosLon = Math.cos(refLonRad);

  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  return { east, north, up };
}

/**
 * Convert local ENU coordinates back to geodetic, given the reference point.
 *
 * @param east   East offset in meters.
 * @param north  North offset in meters.
 * @param up     Up offset in meters.
 * @param refLat Reference latitude in degrees.
 * @param refLon Reference longitude in degrees.
 * @param refAlt Reference altitude in meters.
 */
export function enuToGeodetic(
  east: number,
  north: number,
  up: number,
  refLat: number,
  refLon: number,
  refAlt: number,
): GeodeticCoord {
  const refLatRad = refLat * DEG_TO_RAD;
  const refLonRad = refLon * DEG_TO_RAD;

  const sinLat = Math.sin(refLatRad);
  const cosLat = Math.cos(refLatRad);
  const sinLon = Math.sin(refLonRad);
  const cosLon = Math.cos(refLonRad);

  // ENU → ECEF deltas
  const dx = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
  const dy = cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
  const dz = cosLat * north + sinLat * up;

  const ref = geodeticToECEF(refLat, refLon, refAlt);

  return ecefToGeodetic(ref.x + dx, ref.y + dy, ref.z + dz);
}

// ── Haversine distance ───────────────────────────────────────────────────────

/**
 * Great-circle distance between two points on the WGS84 sphere in meters.
 * Uses the haversine formula with WGS84 semi-major axis as the radius.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return WGS84_A * c;
}

// ── Bearing ──────────────────────────────────────────────────────────────────

/**
 * Initial bearing from point 1 to point 2 in degrees (0 = north, clockwise).
 */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  return clampAngle(Math.atan2(y, x) * RAD_TO_DEG);
}
