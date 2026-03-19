/**
 * Electro-Optical (EO) sensor model — generates bearing measurements from target ground truth.
 */

import type {
  SensorId,
  Timestamp,
  BearingMeasurement,
} from '@eloc2/domain';
import {
  bearingDeg,
  geodeticToENU,
  RAD_TO_DEG,
  haversineDistanceM,
} from '@eloc2/shared-utils';
import type { Position3D } from '@eloc2/domain';
import type { SensorDefinition, FaultDefinition } from '../../types/scenario.js';
import {
  applyAzimuthBias,
  applyClockDrift,
  isSensorInOutage,
} from '../../faults/fault-manager.js';

export interface EoBearingObservation {
  sensorId: string;
  targetId: string;
  bearing: BearingMeasurement;
  imageQuality: number;
}

/** Add Gaussian noise using Box-Muller transform. */
function gaussianNoise(stddev: number, rng: () => number = Math.random): number {
  const u1 = rng();
  const u2 = rng();
  return stddev * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generate an EO bearing observation for a target.
 * Returns undefined if target is out of coverage or sensor is in outage.
 */
export function generateEoBearing(
  sensor: SensorDefinition,
  targetPos: Position3D,
  timeSec: number,
  baseTimestamp: number,
  faults: FaultDefinition[],
  targetId: string = 'unknown',
  rng?: () => number,
): EoBearingObservation | undefined {
  const sensorFaults = faults.filter((f) => f.sensorId === sensor.sensorId);

  // Check outage
  if (isSensorInOutage(sensor.sensorId, sensorFaults)) {
    return undefined;
  }

  // Compute true azimuth
  const trueAzDeg = bearingDeg(
    sensor.position.lat, sensor.position.lon,
    targetPos.lat, targetPos.lon,
  );

  // Compute true elevation using ENU
  const enu = geodeticToENU(
    targetPos.lat, targetPos.lon, targetPos.alt,
    sensor.position.lat, sensor.position.lon, sensor.position.alt,
  );
  const horizDist = Math.sqrt(enu.east * enu.east + enu.north * enu.north);
  const trueElDeg = Math.atan2(enu.up, horizDist) * RAD_TO_DEG;

  // Check range
  const rangeM = haversineDistanceM(
    sensor.position.lat, sensor.position.lon,
    targetPos.lat, targetPos.lon,
  );
  if (rangeM > sensor.coverage.maxRangeM) {
    return undefined;
  }

  // Check coverage arc (FOR — Field of Regard)
  const { minAzDeg, maxAzDeg, minElDeg, maxElDeg } = sensor.coverage;
  let azInRange: boolean;
  if (minAzDeg <= maxAzDeg) {
    azInRange = trueAzDeg >= minAzDeg && trueAzDeg <= maxAzDeg;
  } else {
    azInRange = trueAzDeg >= minAzDeg || trueAzDeg <= maxAzDeg;
  }
  const elInRange = trueElDeg >= minElDeg && trueElDeg <= maxElDeg;

  if (!azInRange || !elInRange) {
    return undefined;
  }

  // Add bearing noise: +/-0.1 deg
  const noisyAzDeg = trueAzDeg + gaussianNoise(0.1);
  const noisyElDeg = trueElDeg + gaussianNoise(0.1);

  // Apply azimuth bias fault
  const biasedAzDeg = applyAzimuthBias(noisyAzDeg, sensorFaults);

  // Timestamp with clock drift
  let timestampMs = baseTimestamp + timeSec * 1000;
  timestampMs = applyClockDrift(timestampMs, sensorFaults);

  // Image quality: 0.8-1.0 with some randomness
  const imageQuality = 0.8 + Math.random() * 0.2;

  const bearing: BearingMeasurement = {
    azimuthDeg: biasedAzDeg,
    elevationDeg: noisyElDeg,
    timestamp: timestampMs as Timestamp,
    sensorId: sensor.sensorId as SensorId,
  };

  return {
    sensorId: sensor.sensorId,
    targetId,
    bearing,
    imageQuality,
  };
}
