import { describe, it, expect } from 'vitest';
import type { BearingMeasurement, SensorId, Timestamp } from '@eloc2/domain';
import {
  alignBearings,
  estimateBearingRate,
  maxTimeSpreadMs,
} from '../src/time-alignment/time-aligner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBearing(
  azimuthDeg: number,
  elevationDeg: number,
  sensorId: string,
  timestamp: number,
): BearingMeasurement {
  return {
    azimuthDeg,
    elevationDeg,
    timestamp: timestamp as Timestamp,
    sensorId: sensorId as SensorId,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('estimateBearingRate', () => {
  it('should compute correct azimuth rate', () => {
    const b1 = makeBearing(10, 5, 'EO-1', 1000);
    const b2 = makeBearing(15, 5, 'EO-1', 2000); // 5 deg in 1 second

    const rate = estimateBearingRate(b1, b2);

    expect(rate.azimuthRateDegPerS).toBeCloseTo(5.0, 10);
    expect(rate.elevationRateDegPerS).toBeCloseTo(0.0, 10);
  });

  it('should compute correct elevation rate', () => {
    const b1 = makeBearing(45, 10, 'EO-1', 0);
    const b2 = makeBearing(45, 12, 'EO-1', 1000); // 2 deg in 1 second

    const rate = estimateBearingRate(b1, b2);

    expect(rate.azimuthRateDegPerS).toBeCloseTo(0.0, 10);
    expect(rate.elevationRateDegPerS).toBeCloseTo(2.0, 10);
  });

  it('should return zero rates for identical timestamps', () => {
    const b1 = makeBearing(45, 10, 'EO-1', 1000);
    const b2 = makeBearing(50, 12, 'EO-1', 1000);

    const rate = estimateBearingRate(b1, b2);

    expect(rate.azimuthRateDegPerS).toBe(0);
    expect(rate.elevationRateDegPerS).toBe(0);
  });
});

describe('alignBearings', () => {
  it('should return as-is for single measurement per sensor', () => {
    const bearings = [
      makeBearing(45, 10, 'EO-1', 1000),
      makeBearing(30, 5, 'EO-2', 1200),
    ];

    const refTime = 1100 as Timestamp;
    const aligned = alignBearings(bearings, refTime);

    expect(aligned).toHaveLength(2);
    // Single-measurement sensors keep their angles
    const eo1 = aligned.find((b) => (b.sensorId as string) === 'EO-1')!;
    const eo2 = aligned.find((b) => (b.sensorId as string) === 'EO-2')!;

    expect(eo1.azimuthDeg).toBe(45);
    expect(eo1.elevationDeg).toBe(10);
    expect(eo1.timestamp).toBe(refTime);

    expect(eo2.azimuthDeg).toBe(30);
    expect(eo2.elevationDeg).toBe(5);
    expect(eo2.timestamp).toBe(refTime);
  });

  it('should extrapolate bearings using rate from consecutive measurements', () => {
    // EO-1 has two measurements: azimuth moves 5 deg/s
    const bearings = [
      makeBearing(40, 10, 'EO-1', 1000),
      makeBearing(45, 10, 'EO-1', 2000), // +5 deg in 1s
      makeBearing(30, 5, 'EO-2', 1500),
    ];

    const refTime = 3000 as Timestamp; // 1 second after last EO-1 measurement
    const aligned = alignBearings(bearings, refTime);

    const eo1 = aligned.find((b) => (b.sensorId as string) === 'EO-1')!;
    // Should extrapolate from t=2000: 45 + 5*(3000-2000)/1000 = 50
    expect(eo1.azimuthDeg).toBeCloseTo(50, 10);
    expect(eo1.timestamp).toBe(refTime);
  });

  it('should handle moving target with both azimuth and elevation changes', () => {
    const bearings = [
      makeBearing(10, 5, 'EO-1', 0),
      makeBearing(12, 6, 'EO-1', 1000), // az +2/s, el +1/s
    ];

    const refTime = 2000 as Timestamp; // 1 second after last
    const aligned = alignBearings(bearings, refTime);

    expect(aligned).toHaveLength(1);
    expect(aligned[0].azimuthDeg).toBeCloseTo(14, 10);  // 12 + 2*1
    expect(aligned[0].elevationDeg).toBeCloseTo(7, 10);  // 6 + 1*1
  });
});

describe('maxTimeSpreadMs', () => {
  it('should return 0 for empty array', () => {
    expect(maxTimeSpreadMs([], 1000 as Timestamp)).toBe(0);
  });

  it('should compute correct spread', () => {
    const bearings = [
      makeBearing(10, 5, 'EO-1', 900),
      makeBearing(20, 5, 'EO-2', 1100),
      makeBearing(30, 5, 'EO-3', 1050),
    ];

    const spread = maxTimeSpreadMs(bearings, 1000 as Timestamp);
    expect(spread).toBe(100); // max(|900-1000|, |1100-1000|, |1050-1000|) = 100
  });
});
