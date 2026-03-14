import type {
  FieldOfView,
  Position3D,
} from '@eloc2/domain';
import {
  bearingDeg,
  haversineDistanceM,
  DEG_TO_RAD,
  RAD_TO_DEG,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// FOV footprint
// ---------------------------------------------------------------------------

/**
 * Computes the approximate footprint of a sensor's field of view projected
 * onto a horizontal plane at the specified target altitude.
 *
 * @param sensorPosition - Geodetic position of the sensor.
 * @param azimuthDeg     - Gimbal azimuth in degrees.
 * @param elevationDeg   - Gimbal elevation in degrees.
 * @param fov            - Half-angle field of view specification.
 * @param targetAltitude - Altitude of the plane to project onto (meters).
 * @returns Center lat/lon and footprint width/height in meters.
 */
export function computeFovFootprint(
  sensorPosition: Position3D,
  azimuthDeg: number,
  elevationDeg: number,
  fov: FieldOfView,
  targetAltitude: number,
): {
  centerLat: number;
  centerLon: number;
  widthM: number;
  heightM: number;
} {
  const altDiff = targetAltitude - sensorPosition.alt;
  const elRad = elevationDeg * DEG_TO_RAD;

  // Slant range to the target altitude plane along the gimbal line of sight.
  // range = altDiff / sin(elevation)  when elevation > 0
  // If elevation is near zero or negative, use a large fallback range.
  let rangeM: number;
  const sinEl = Math.sin(elRad);
  if (Math.abs(sinEl) > 0.01) {
    rangeM = Math.abs(altDiff / sinEl);
  } else {
    // Near-horizontal pointing — use a nominal 50 km range
    rangeM = 50_000;
  }

  // Footprint dimensions at the computed range
  const widthM =
    2 * rangeM * Math.tan(fov.halfAngleHDeg * DEG_TO_RAD);
  const heightM =
    2 * rangeM * Math.tan(fov.halfAngleVDeg * DEG_TO_RAD);

  // Horizontal ground distance from sensor to the center of the footprint
  const cosEl = Math.cos(elRad);
  const groundDistM = rangeM * cosEl;

  // Project the center point along the azimuth at groundDistM
  const azRad = azimuthDeg * DEG_TO_RAD;
  // Approximate geodetic offset
  const dNorth = groundDistM * Math.cos(azRad);
  const dEast = groundDistM * Math.sin(azRad);

  const centerLat =
    sensorPosition.lat + dNorth / 111_320;
  const centerLon =
    sensorPosition.lon +
    dEast / (111_320 * Math.cos(sensorPosition.lat * DEG_TO_RAD));

  return { centerLat, centerLon, widthM, heightM };
}

// ---------------------------------------------------------------------------
// Target-in-FOV check
// ---------------------------------------------------------------------------

/**
 * Determines whether a target at a given position falls within a sensor's
 * field of view, given the current gimbal pointing.
 *
 * @param sensorPosition - Geodetic position of the sensor.
 * @param gimbalAz       - Gimbal azimuth in degrees.
 * @param gimbalEl       - Gimbal elevation in degrees.
 * @param fov            - Half-angle field of view specification.
 * @param targetPosition - Geodetic position of the target.
 * @returns `true` if the target is within the FOV.
 */
export function isTargetInFov(
  sensorPosition: Position3D,
  gimbalAz: number,
  gimbalEl: number,
  fov: FieldOfView,
  targetPosition: Position3D,
): boolean {
  // Compute bearing and elevation from sensor to target
  const targetAz = bearingDeg(
    sensorPosition.lat,
    sensorPosition.lon,
    targetPosition.lat,
    targetPosition.lon,
  );

  const horizontalDistM = haversineDistanceM(
    sensorPosition.lat,
    sensorPosition.lon,
    targetPosition.lat,
    targetPosition.lon,
  );

  const altDiff = targetPosition.alt - sensorPosition.alt;
  const targetEl = Math.atan2(altDiff, horizontalDistM) * RAD_TO_DEG;

  // Azimuth difference accounting for wrap-around
  let deltaAz = targetAz - gimbalAz;
  if (deltaAz > 180) deltaAz -= 360;
  if (deltaAz < -180) deltaAz += 360;

  const deltaEl = targetEl - gimbalEl;

  return (
    Math.abs(deltaAz) <= fov.halfAngleHDeg &&
    Math.abs(deltaEl) <= fov.halfAngleVDeg
  );
}
