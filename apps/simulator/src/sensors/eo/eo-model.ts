/**
 * Electro-Optical (EO) sensor model — generates bearing measurements from target ground truth.
 */

import type {
  SensorId,
  Timestamp,
  BearingMeasurement,
  WeatherCondition,
  TargetClassification,
  DriTier,
} from '@eloc2/domain';
import { computeDriTier } from '@eloc2/domain';
import {
  bearingDeg,
  geodeticToENU,
  RAD_TO_DEG,
  haversineDistanceM,
} from '@eloc2/shared-utils';
import type { Position3D } from '@eloc2/domain';
import { checkLineOfSight } from '@eloc2/terrain';
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
  /** DRI tier achieved at this range */
  driTier?: DriTier;
}

/** Add Gaussian noise using Box-Muller transform. */
function gaussianNoise(stddev: number, rng: () => number = Math.random): number {
  const u1 = rng();
  const u2 = rng();
  return stddev * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Compute time-of-day range modifier for EO sensors.
 * Assumes scenario start at 08:00 local time.
 *   Day   (06:00-18:00): 100%
 *   Dawn  (05:00-06:00): 70%
 *   Dusk  (18:00-19:00): 70%
 *   Night (19:00-05:00): 40%
 */
function timeOfDayRangeModifier(timeSec: number): number {
  const SCENARIO_START_HOUR = 8; // 08:00 local
  const hourOfDay = (SCENARIO_START_HOUR + timeSec / 3600) % 24;

  if (hourOfDay >= 6 && hourOfDay < 18) return 1.0;   // Day
  if (hourOfDay >= 5 && hourOfDay < 6) return 0.7;     // Dawn
  if (hourOfDay >= 18 && hourOfDay < 19) return 0.7;   // Dusk
  return 0.4;                                           // Night
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
  options?: { terrainLos?: boolean; weather?: WeatherCondition; targetClassification?: TargetClassification },
): EoBearingObservation | undefined {
  const sensorFaults = faults.filter((f) => f.sensorId === sensor.sensorId);

  // Check outage
  if (isSensorInOutage(sensor.sensorId, sensorFaults)) {
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

  // Check range — DRI detection range may exceed coverage.maxRangeM (e.g. ballistic missiles)
  const rangeM = haversineDistanceM(
    sensor.position.lat, sensor.position.lon,
    targetPos.lat, targetPos.lon,
  );

  // DRI-based detection range check with time-of-day and weather modulation
  let driTier: DriTier | undefined;
  if (sensor.maxDetectionRangeM !== undefined) {
    const todModifier = timeOfDayRangeModifier(timeSec);
    // Weather visibility reduction: full range at 10km+, linear reduction below
    const weatherModifier = options?.weather
      ? Math.min(1, options.weather.visibilityKm / 10)
      : 1.0;
    const effectiveBaseRange = sensor.maxDetectionRangeM * todModifier * weatherModifier;

    // Compute DRI tier based on target classification and range
    const dri = computeDriTier(rangeM, effectiveBaseRange, options?.targetClassification);
    if (!dri.tier) {
      return undefined; // Beyond DRI detection range for this target type
    }
    driTier = dri.tier;
  } else {
    // No DRI configured — fall back to hard coverage range check
    if (rangeM > sensor.coverage.maxRangeM) {
      return undefined;
    }
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

  // Add bearing noise with frame integration.
  // Real MWIR staring sensors sample at 24 Hz. Between simulation ticks
  // (typically 2s), the sensor integrates ~48 frames. This reduces bearing
  // noise by sqrt(N_frames) compared to single-frame noise.
  // Single-frame noise: σ = 0.1° (Gaussian)
  // Staring sensor (slewRate=0): full 48-frame integration → σ/√48 ≈ 0.014°
  // Gimbal sensor (slewRate>0): partial integration (target moves in FOV) → σ/√12 ≈ 0.029°
  const FRAME_RATE_HZ = 24;
  const UPDATE_INTERVAL_SEC = 2;
  const singleFrameNoiseDeg = 0.1;
  const isStaring = (sensor.slewRateDegPerSec ?? 0) === 0;
  const integrationFrames = isStaring
    ? FRAME_RATE_HZ * UPDATE_INTERVAL_SEC          // staring: full integration
    : Math.min(12, FRAME_RATE_HZ * UPDATE_INTERVAL_SEC * 0.25); // gimbal: partial (target drifts in FOV)
  const effectiveNoiseDeg = singleFrameNoiseDeg / Math.sqrt(integrationFrames);

  const r = rng ?? Math.random;
  const noisyAzDeg = trueAzDeg + gaussianNoise(effectiveNoiseDeg, r);
  const noisyElDeg = trueElDeg + gaussianNoise(effectiveNoiseDeg, r);

  // Apply azimuth bias fault
  const biasedAzDeg = applyAzimuthBias(noisyAzDeg, sensorFaults);

  // Timestamp with clock drift
  let timestampMs = baseTimestamp + timeSec * 1000;
  timestampMs = applyClockDrift(timestampMs, sensorFaults);

  // Image quality: DRI tier-dependent + randomness
  // Identification: 0.8-1.0, Recognition: 0.5-0.7, Detection: 0.2-0.4
  let imageQuality: number;
  if (driTier === 'identification') {
    imageQuality = 0.8 + r() * 0.2;
  } else if (driTier === 'recognition') {
    imageQuality = 0.5 + r() * 0.2;
  } else if (driTier === 'detection') {
    imageQuality = 0.2 + r() * 0.2;
  } else {
    imageQuality = 0.8 + r() * 0.2; // No DRI info — legacy behavior
  }

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
    driTier,
  };
}
