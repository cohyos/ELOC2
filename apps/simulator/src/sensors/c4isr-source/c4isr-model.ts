/**
 * C4ISR source model — generates system-level track observations
 * with lower update rate but moderate accuracy.
 * Always available (no coverage check).
 */

import type {
  Position3D,
  Velocity3D,
  SensorId,
  Timestamp,
  SourceObservation,
  Covariance3x3,
} from '@eloc2/domain';
import { generateId, DEG_TO_RAD } from '@eloc2/shared-utils';
import type { SensorDefinition, FaultDefinition } from '../../types/scenario.js';
import { isSensorInOutage, applyClockDrift } from '../../faults/fault-manager.js';

/** Add Gaussian noise using Box-Muller transform. */
function gaussianNoise(stddev: number, rng: () => number = Math.random): number {
  const u1 = rng();
  const u2 = rng();
  return stddev * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generate a C4ISR observation for a target.
 * C4ISR sources always report (no coverage check), with moderate noise.
 * Noise: +/-200m position, +/-5m/s velocity.
 * Returns undefined if the sensor is in outage.
 */
export function generateC4isrObservation(
  sensor: SensorDefinition,
  targetPos: Position3D,
  targetVel: Velocity3D | undefined,
  timeSec: number,
  baseTimestamp: number,
  faults: FaultDefinition[] = [],
  rng?: () => number,
): SourceObservation | undefined {
  // Check for sensor outage
  if (isSensorInOutage(sensor.sensorId, faults)) {
    return undefined;
  }
  // Position noise: +/-200m
  const posNoise = 200;
  const r = rng ?? Math.random;
  const noisyPos: Position3D = {
    lat: targetPos.lat + gaussianNoise(posNoise / 111_320, r),
    lon: targetPos.lon + gaussianNoise(posNoise / (111_320 * Math.cos(targetPos.lat * DEG_TO_RAD)), r),
    alt: targetPos.alt + gaussianNoise(posNoise, r),
  };

  // Velocity noise: +/-5 m/s
  let noisyVel: Velocity3D | undefined;
  if (targetVel) {
    noisyVel = {
      vx: targetVel.vx + gaussianNoise(5, r),
      vy: targetVel.vy + gaussianNoise(5, r),
      vz: targetVel.vz + gaussianNoise(5, r),
    };
  }

  // Covariance: diagonal, fixed moderate values
  const baseCov = posNoise * posNoise;
  const cov: Covariance3x3 = [
    [baseCov, 0, 0],
    [0, baseCov, 0],
    [0, 0, baseCov],
  ];

  let timestampMs = baseTimestamp + timeSec * 1000;
  timestampMs = applyClockDrift(timestampMs, faults);

  return {
    observationId: generateId(),
    sensorId: sensor.sensorId as SensorId,
    timestamp: timestampMs as Timestamp,
    position: noisyPos,
    velocity: noisyVel,
    covariance: cov,
    sensorFrame: 'c4isr',
  };
}
