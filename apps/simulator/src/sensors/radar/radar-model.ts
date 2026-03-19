/**
 * Radar sensor model — generates SourceObservation from target ground truth.
 */

import type {
  Position3D,
  Velocity3D,
  SensorId,
  Timestamp,
  SourceObservation,
  Covariance3x3,
  WeatherCondition,
  ClutterZone,
} from '@eloc2/domain';
import { TARGET_RCS } from '@eloc2/domain';
import {
  generateId,
  haversineDistanceM,
  bearingDeg,
  geodeticToENU,
  DEG_TO_RAD,
  RAD_TO_DEG,
} from '@eloc2/shared-utils';
import { checkLineOfSight } from '@eloc2/terrain';
import type { SensorDefinition, FaultDefinition } from '../../types/scenario.js';
import {
  applyAzimuthBias,
  applyClockDrift,
  isSensorInOutage,
} from '../../faults/fault-manager.js';

export interface RadarObservation {
  sensorId: string;
  targetId: string;
  observation: SourceObservation;
}

/** Add Gaussian noise using Box-Muller transform. */
function gaussianNoise(stddev: number, rng: () => number = Math.random): number {
  const u1 = rng();
  const u2 = rng();
  return stddev * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Compute effective radar detection range based on target RCS.
 * Uses the radar equation: range proportional to RCS^0.25
 * Reference RCS = 1.0 m² (base range spec assumes 1 m² target).
 */
function computeEffectiveRange(baseRangeM: number, rcs: number): number {
  const REFERENCE_RCS = 1.0; // m²
  const factor = Math.pow(rcs / REFERENCE_RCS, 0.25);
  return Math.min(baseRangeM * factor, baseRangeM * 2); // cap at 2x base range
}

/**
 * Check if a target is within the sensor's coverage arc.
 */
function isInCoverage(
  sensor: SensorDefinition,
  targetPos: Position3D,
  effectiveMaxRangeM?: number,
): { inCoverage: boolean; rangeM: number; azDeg: number; elDeg: number } {
  const maxRange = effectiveMaxRangeM ?? sensor.coverage.maxRangeM;
  const rangeM = haversineDistanceM(
    sensor.position.lat, sensor.position.lon,
    targetPos.lat, targetPos.lon,
  );

  // Check range
  if (rangeM > maxRange) {
    return { inCoverage: false, rangeM, azDeg: 0, elDeg: 0 };
  }

  // Compute azimuth
  const azDeg = bearingDeg(
    sensor.position.lat, sensor.position.lon,
    targetPos.lat, targetPos.lon,
  );

  // Compute elevation using ENU
  const enu = geodeticToENU(
    targetPos.lat, targetPos.lon, targetPos.alt,
    sensor.position.lat, sensor.position.lon, sensor.position.alt,
  );
  const horizDist = Math.sqrt(enu.east * enu.east + enu.north * enu.north);
  const elDeg = Math.atan2(enu.up, horizDist) * RAD_TO_DEG;

  // Check azimuth bounds (handle wrap-around)
  const { minAzDeg, maxAzDeg, minElDeg, maxElDeg } = sensor.coverage;
  let azInRange: boolean;
  if (minAzDeg <= maxAzDeg) {
    azInRange = azDeg >= minAzDeg && azDeg <= maxAzDeg;
  } else {
    // Wraps around 360 (e.g., 350 to 10)
    azInRange = azDeg >= minAzDeg || azDeg <= maxAzDeg;
  }

  const elInRange = elDeg >= minElDeg && elDeg <= maxElDeg;

  return { inCoverage: azInRange && elInRange, rangeM, azDeg, elDeg };
}

/**
 * Generate a radar observation for a target.
 * Returns undefined if target is out of coverage or sensor is in outage.
 */
export function generateRadarObservation(
  sensor: SensorDefinition,
  targetPos: Position3D,
  targetVel: Velocity3D | undefined,
  timeSec: number,
  baseTimestamp: number,
  faults: FaultDefinition[],
  targetId: string = 'unknown',
  rng?: () => number,
  options?: { rcs?: number; classification?: string; terrainLos?: boolean; weather?: WeatherCondition },
): RadarObservation | undefined {
  // Check outage
  if (isSensorInOutage(sensor.sensorId, faults)) {
    return undefined;
  }

  // Terrain line-of-sight check (opt-in via options.terrainLos)
  if (options?.terrainLos) {
    const los = checkLineOfSight(
      { lat: sensor.position.lat, lon: sensor.position.lon, alt: sensor.position.alt },
      { lat: targetPos.lat, lon: targetPos.lon, alt: targetPos.alt },
    );
    if (!los.visible) {
      return undefined;
    }
  }

  // Compute effective range based on RCS
  // Priority: explicit rcs > classification lookup > default 1.0 m²
  const rcs = options?.rcs
    ?? (options?.classification ? TARGET_RCS[options.classification] ?? 1.0 : 1.0);
  let effectiveMaxRange = computeEffectiveRange(sensor.coverage.maxRangeM, rcs);

  // Apply weather-based rain attenuation: up to 30% range reduction at 50+ mm/hr
  if (options?.weather && options.weather.rainMmHr > 0) {
    const rainFactor = 1 - 0.3 * Math.min(1, options.weather.rainMmHr / 50);
    effectiveMaxRange *= rainFactor;
  }

  // Check coverage
  const coverage = isInCoverage(sensor, targetPos, effectiveMaxRange);
  if (!coverage.inCoverage) {
    return undefined;
  }

  // Position noise: +/-50m
  const posNoise = 50;
  const r = rng ?? Math.random;
  const noisyPos: Position3D = {
    lat: targetPos.lat + gaussianNoise(posNoise / 111_320, r),
    lon: targetPos.lon + gaussianNoise(posNoise / (111_320 * Math.cos(targetPos.lat * DEG_TO_RAD)), r),
    alt: targetPos.alt + gaussianNoise(posNoise, r),
  };

  // Velocity noise: +/-2 m/s
  let noisyVel: Velocity3D | undefined;
  if (targetVel) {
    noisyVel = {
      vx: targetVel.vx + gaussianNoise(2, r),
      vy: targetVel.vy + gaussianNoise(2, r),
      vz: targetVel.vz + gaussianNoise(2, r),
    };
  }

  // Apply azimuth bias to the measured position (shift in azimuth direction)
  const sensorFaults = faults.filter((f) => f.sensorId === sensor.sensorId);
  const biasedAz = applyAzimuthBias(coverage.azDeg, sensorFaults);
  // We apply the bias by noting it for the observation — the position already has noise;
  // for simplicity, include bias in the reported position through ENU offset
  if (biasedAz !== coverage.azDeg) {
    const biasDeg = biasedAz - coverage.azDeg;
    const biasRad = biasDeg * DEG_TO_RAD;
    const shiftEast = coverage.rangeM * Math.sin(biasRad);
    const shiftNorth = coverage.rangeM * (Math.cos(biasRad) - 1);
    noisyPos.lon += shiftEast / (111_320 * Math.cos(noisyPos.lat * DEG_TO_RAD));
    noisyPos.lat += shiftNorth / 111_320;
  }

  // Timestamp in milliseconds
  let timestampMs = baseTimestamp + timeSec * 1000;
  timestampMs = applyClockDrift(timestampMs, sensorFaults);

  // Covariance: diagonal, proportional to range squared
  const rangeFactor = (coverage.rangeM / 10_000) ** 2;
  const baseCov = posNoise * posNoise;
  const cov: Covariance3x3 = [
    [baseCov * rangeFactor, 0, 0],
    [0, baseCov * rangeFactor, 0],
    [0, 0, baseCov * rangeFactor],
  ];

  const observation: SourceObservation = {
    observationId: generateId(),
    sensorId: sensor.sensorId as SensorId,
    timestamp: timestampMs as Timestamp,
    position: noisyPos,
    velocity: noisyVel,
    covariance: cov,
    sensorFrame: 'radar',
  };

  return {
    sensorId: sensor.sensorId,
    targetId,
    observation,
  };
}

/**
 * Generate false alarm observations from radar clutter zones.
 * For each clutter zone within radar range, rolls against density probability
 * to produce a false detection at a random position within the zone.
 */
export function generateClutterFalseAlarms(
  sensor: SensorDefinition,
  clutterZones: ClutterZone[],
  timeSec: number,
  baseTimestamp: number,
  rng?: () => number,
): RadarObservation[] {
  const results: RadarObservation[] = [];
  const r = rng ?? Math.random;

  for (const zone of clutterZones) {
    const rangeM = haversineDistanceM(
      sensor.position.lat, sensor.position.lon,
      zone.center.lat, zone.center.lon,
    );
    if (rangeM > sensor.coverage.maxRangeM) continue;

    if (r() > zone.density) continue;

    const angle = r() * 2 * Math.PI;
    const dist = Math.sqrt(r()) * zone.radiusM;
    const mPerDegLon = 111320 * Math.cos(zone.center.lat * DEG_TO_RAD);
    const mPerDegLat = 110540;
    const falsePos: Position3D = {
      lat: zone.center.lat + (dist * Math.cos(angle)) / mPerDegLat,
      lon: zone.center.lon + (dist * Math.sin(angle)) / mPerDegLon,
      alt: sensor.position.alt + gaussianNoise(200, r),
    };

    const highCov = 10000;
    const cov: Covariance3x3 = [
      [highCov, 0, 0],
      [0, highCov, 0],
      [0, 0, highCov],
    ];

    const timestampMs = baseTimestamp + timeSec * 1000;
    const observation: SourceObservation = {
      observationId: generateId(),
      sensorId: sensor.sensorId as SensorId,
      timestamp: timestampMs as Timestamp,
      position: falsePos,
      velocity: undefined,
      covariance: cov,
      sensorFrame: 'radar',
    };

    results.push({
      sensorId: sensor.sensorId,
      targetId: `clutter-${zone.id}-${generateId().slice(0, 6)}`,
      observation,
    });
  }

  return results;
}
