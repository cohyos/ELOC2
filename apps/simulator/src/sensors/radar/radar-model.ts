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
  DopplerQuality,
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

// ---------------------------------------------------------------------------
// Phased Array Radar Constants
// ---------------------------------------------------------------------------

/** Default scan rate for phased array radar (Hz). Electronically steered = fast. */
const DEFAULT_SCAN_RATE_HZ = 6;

/** Default PRF (Pulse Repetition Frequency) in Hz */
const DEFAULT_PRF_HZ = 3000;

/** Default radar wavelength in meters (S-band) */
const DEFAULT_WAVELENGTH_M = 0.1;

/**
 * Compute detection probability based on range ratio.
 * RCS is already factored into effectiveMaxRangeM via computeEffectiveRange().
 * At max effective range, Pd ≈ 0.5. At half range, Pd ≈ 0.99.
 */
function computeDetectionProbability(
  rangeM: number,
  effectiveMaxRangeM: number,
): number {
  if (rangeM <= 0 || effectiveMaxRangeM <= 0) return 1.0;
  // Normalized range ratio (0 = at sensor, 1 = at max effective range)
  const rangeFraction = rangeM / effectiveMaxRangeM;
  // Pd follows a sigmoid-like curve: high at close range, drops near max range
  // At fraction=0.5: Pd≈0.99, at fraction=0.9: Pd≈0.85, at fraction=1.0: Pd≈0.50
  const basePd = 1.0 / (1.0 + Math.exp(10 * (rangeFraction - 0.95)));
  // RCS already accounted for in effectiveMaxRangeM via computeEffectiveRange()
  return Math.min(1.0, basePd);
}

// ---------------------------------------------------------------------------
// Doppler / radial-velocity helpers
// ---------------------------------------------------------------------------

/**
 * Compute the true radial velocity of a target relative to a sensor.
 * Positive = receding (moving away), negative = approaching.
 * Uses the line-of-sight unit vector from sensor to target projected onto target velocity.
 */
function computeRadialVelocity(
  sensorPos: Position3D,
  targetPos: Position3D,
  targetVel: Velocity3D,
): number {
  // ENU unit vector from sensor to target
  const enu = geodeticToENU(
    targetPos.lat, targetPos.lon, targetPos.alt,
    sensorPos.lat, sensorPos.lon, sensorPos.alt,
  );
  const dist = Math.sqrt(enu.east ** 2 + enu.north ** 2 + enu.up ** 2);
  if (dist < 1) return 0; // co-located guard

  const ux = enu.east / dist;
  const uy = enu.north / dist;
  const uz = enu.up / dist;

  // Project target velocity (ENU: vx=East, vy=North, vz=Up) onto LOS
  return targetVel.vx * ux + targetVel.vy * uy + (targetVel.vz ?? 0) * uz;
}

/**
 * Compute the first blind speed for a pulsed-Doppler radar.
 * blind_speed = (PRF × wavelength) / 2
 */
function computeBlindSpeed(prfHz: number, wavelengthM: number): number {
  return (prfHz * wavelengthM) / 2;
}

/**
 * Determine Doppler measurement quality based on radial velocity magnitude
 * and proximity to blind speeds.
 */
function assessDopplerQuality(
  radialVelMps: number,
  blindSpeedMps: number,
): DopplerQuality {
  const absVr = Math.abs(radialVelMps);

  // Near-zero radial velocity — mainlobe clutter region
  if (absVr < 2) return 'low';

  // Check proximity to blind speed multiples (within 5% of blind speed)
  const blindMargin = blindSpeedMps * 0.05;
  for (let n = 1; n <= 3; n++) {
    if (Math.abs(absVr - n * blindSpeedMps) < blindMargin) return 'blind';
  }

  // Good Doppler return
  if (absVr > 15) return 'high';
  return 'medium';
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
  options?: {
    rcs?: number;
    classification?: string;
    terrainLos?: boolean;
    weather?: WeatherCondition;
    /** Enable MTI filtering — rejects targets with near-zero radial velocity. Default false. */
    mtiEnabled?: boolean;
    /** Pulse Repetition Frequency in Hz (for blind speed calc). Default 3000. */
    prfHz?: number;
    /** Radar wavelength in meters (for blind speed calc). Default 0.1 (S-band). */
    wavelengthM?: number;
    /**
     * Phased array scan rate in Hz. Multiple scans per simulation tick
     * integrate to reduce noise by √(scansPerTick). Default 6 Hz.
     * Set to 0 to disable scan integration.
     */
    scanRateHz?: number;
    /** Simulation tick interval in seconds. Default 1. Used with scanRateHz for integration. */
    tickIntervalSec?: number;
    /** Pre-computed scan timestamp (ms) — ensures all targets in the same scan share one timestamp.
     *  When provided, this overrides the internal timestamp computation. */
    scanTimestampMs?: number;
    /** Enable RCS-based probabilistic detection. Default true for phased array realism. */
    enablePd?: boolean;
  },
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

  // ── Phased array Pd-based probabilistic detection ──
  // A real phased array radar has a detection probability that depends on
  // RCS and range. Small targets at long range are sometimes missed.
  // Opt-in: disabled by default to preserve deterministic behavior in tests.
  if (options?.enablePd === true) {
    const pd = computeDetectionProbability(coverage.rangeM, effectiveMaxRange);
    const r0 = rng ?? Math.random;
    if (r0() > pd) {
      return undefined; // target not detected this scan
    }
  }

  // ── Phased array scan integration ──
  // A phased array scanning at N Hz with a simulation tick of T seconds
  // integrates N*T scans. Noise reduces by √(N*T) (incoherent integration).
  const scanRateHz = options?.scanRateHz ?? DEFAULT_SCAN_RATE_HZ;
  const tickSec = options?.tickIntervalSec ?? 1/15;
  const scansPerTick = Math.max(1, Math.round(scanRateHz * tickSec));
  const integrationFactor = Math.sqrt(scansPerTick); // noise reduction

  // Position noise: base ±50m, reduced by scan integration
  const posNoise = 50 / integrationFactor;
  const r = rng ?? Math.random;
  const noisyPos: Position3D = {
    lat: targetPos.lat + gaussianNoise(posNoise / 111_320, r),
    lon: targetPos.lon + gaussianNoise(posNoise / (111_320 * Math.cos(targetPos.lat * DEG_TO_RAD)), r),
    alt: targetPos.alt + gaussianNoise(posNoise, r),
  };

  // Velocity noise: base ±2 m/s, reduced by scan integration
  const velNoise = 2 / integrationFactor;
  let noisyVel: Velocity3D | undefined;
  if (targetVel) {
    noisyVel = {
      vx: targetVel.vx + gaussianNoise(velNoise, r),
      vy: targetVel.vy + gaussianNoise(velNoise, r),
      vz: targetVel.vz + gaussianNoise(velNoise, r),
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

  // ---------------------------------------------------------------------------
  // Doppler / radial velocity
  // ---------------------------------------------------------------------------
  const prfHz = options?.prfHz ?? DEFAULT_PRF_HZ;
  const wavelengthM = options?.wavelengthM ?? DEFAULT_WAVELENGTH_M;
  const blindSpeedMps = computeBlindSpeed(prfHz, wavelengthM);

  let radialVelocity: number | undefined;
  let dopplerQuality: DopplerQuality | undefined;

  if (targetVel) {
    const trueRadialVel = computeRadialVelocity(sensor.position, targetPos, targetVel);

    // Doppler noise: stddev ~1 m/s (typical for pulsed-Doppler radar)
    radialVelocity = trueRadialVel + gaussianNoise(1.0, r);

    dopplerQuality = assessDopplerQuality(radialVelocity, blindSpeedMps);

    // MTI filter: reject targets with near-zero radial velocity (clutter)
    if (options?.mtiEnabled && Math.abs(radialVelocity) < 2) {
      return undefined; // filtered as clutter by MTI
    }
  }

  // Timestamp in milliseconds — use scan-coherent timestamp if provided
  // (ensures all targets detected in the same scan share one timestamp)
  let timestampMs = options?.scanTimestampMs ?? (baseTimestamp + timeSec * 1000);
  if (!options?.scanTimestampMs) {
    timestampMs = applyClockDrift(timestampMs, sensorFaults);
  }

  // Covariance: diagonal, proportional to range squared.
  // Floor at range=30km equivalent to prevent over-tight covariance at close range
  // which causes correlation gate failures and track proliferation.
  const rangeForCov = Math.max(coverage.rangeM, 30_000);
  const rangeFactor = (rangeForCov / 10_000) ** 2;
  const baseCov = posNoise * posNoise;
  const covDiag = baseCov * rangeFactor;
  const cov: Covariance3x3 = [
    [covDiag, 0, 0],
    [0, covDiag, 0],
    [0, 0, covDiag],
  ];

  const observation: SourceObservation = {
    observationId: generateId(),
    sensorId: sensor.sensorId as SensorId,
    timestamp: timestampMs as Timestamp,
    position: noisyPos,
    velocity: noisyVel,
    covariance: cov,
    sensorFrame: 'radar',
    radialVelocity,
    dopplerQuality,
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
