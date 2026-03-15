/**
 * Time alignment for bearing measurements.
 *
 * Extrapolates bearings to a common reference time using bearing-rate
 * estimation from consecutive measurements of the same sensor.
 */

import type { BearingMeasurement, SensorId, Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Bearing rate in degrees per second. */
export interface BearingRate {
  azimuthRateDegPerS: number;
  elevationRateDegPerS: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extrapolate an array of bearing measurements to a common reference time.
 *
 * For each sensor that has multiple measurements, the bearing rate is estimated
 * from consecutive pairs and used to extrapolate. If only one measurement
 * exists for a sensor, it is returned as-is.
 *
 * @param bearings  All bearing measurements (may include multiple per sensor).
 * @param referenceTime  The common time to extrapolate to.
 * @returns  One aligned bearing per sensor, all at `referenceTime`.
 */
export function alignBearings(
  bearings: BearingMeasurement[],
  referenceTime: Timestamp,
): BearingMeasurement[] {
  // Group bearings by sensor
  const bySensor = new Map<SensorId, BearingMeasurement[]>();

  for (const b of bearings) {
    const existing = bySensor.get(b.sensorId);
    if (existing) {
      existing.push(b);
    } else {
      bySensor.set(b.sensorId, [b]);
    }
  }

  const aligned: BearingMeasurement[] = [];

  for (const [sensorId, sensorBearings] of bySensor) {
    // Sort by timestamp
    sensorBearings.sort((a, b) => (a.timestamp as number) - (b.timestamp as number));

    if (sensorBearings.length === 1) {
      // No rate estimation possible — return as-is with updated timestamp
      aligned.push({
        ...sensorBearings[0],
        timestamp: referenceTime,
      });
      continue;
    }

    // Use the last two measurements to estimate bearing rate
    const b1 = sensorBearings[sensorBearings.length - 2];
    const b2 = sensorBearings[sensorBearings.length - 1];
    const rate = estimateBearingRate(b1, b2);

    // Extrapolate from the most recent measurement
    const dtS = ((referenceTime as number) - (b2.timestamp as number)) / 1000;

    aligned.push({
      azimuthDeg: b2.azimuthDeg + rate.azimuthRateDegPerS * dtS,
      elevationDeg: b2.elevationDeg + rate.elevationRateDegPerS * dtS,
      timestamp: referenceTime,
      sensorId,
    });
  }

  return aligned;
}

/**
 * Estimate bearing rate from two consecutive measurements of the same sensor.
 *
 * @param b1  Earlier measurement.
 * @param b2  Later measurement.
 */
export function estimateBearingRate(
  b1: BearingMeasurement,
  b2: BearingMeasurement,
): BearingRate {
  const dtMs = (b2.timestamp as number) - (b1.timestamp as number);

  if (Math.abs(dtMs) < 1) {
    return { azimuthRateDegPerS: 0, elevationRateDegPerS: 0 };
  }

  const dtS = dtMs / 1000;

  return {
    azimuthRateDegPerS: (b2.azimuthDeg - b1.azimuthDeg) / dtS,
    elevationRateDegPerS: (b2.elevationDeg - b1.elevationDeg) / dtS,
  };
}

/**
 * Compute the maximum time misalignment in milliseconds among a set of
 * bearings relative to a reference time.
 */
export function maxTimeSpreadMs(
  bearings: BearingMeasurement[],
  referenceTime: Timestamp,
): number {
  if (bearings.length === 0) return 0;

  let maxSpread = 0;
  for (const b of bearings) {
    const diff = Math.abs((b.timestamp as number) - (referenceTime as number));
    if (diff > maxSpread) maxSpread = diff;
  }

  return maxSpread;
}
