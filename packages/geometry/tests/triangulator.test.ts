import { describe, it, expect } from 'vitest';
import type { BearingMeasurement, Position3D, SensorId, Timestamp } from '@eloc2/domain';
import { bearingDeg, haversineDistanceM, geodeticToENU } from '@eloc2/shared-utils';
import {
  triangulateTwoBearings,
  triangulateMultiple,
} from '../src/triangulation/triangulator.js';

// ---------------------------------------------------------------------------
// Test fixtures — central Israel
// ---------------------------------------------------------------------------

const EO1: Position3D = { lat: 31.0, lon: 34.5, alt: 200 };
const EO2: Position3D = { lat: 31.3, lon: 34.8, alt: 180 };
const EO3: Position3D = { lat: 31.5, lon: 34.3, alt: 250 };
const TARGET: Position3D = { lat: 31.25, lon: 34.65, alt: 5000 };

/**
 * Compute the true azimuth and elevation from a sensor to the target
 * using ENU coordinates.
 */
function computeTrueBearing(
  sensor: Position3D,
  target: Position3D,
): { azimuthDeg: number; elevationDeg: number } {
  const enu = geodeticToENU(
    target.lat,
    target.lon,
    target.alt,
    sensor.lat,
    sensor.lon,
    sensor.alt,
  );

  const horizontalDist = Math.sqrt(enu.east ** 2 + enu.north ** 2);
  const azimuthDeg = Math.atan2(enu.east, enu.north) * (180 / Math.PI);
  const elevationDeg = Math.atan2(enu.up, horizontalDist) * (180 / Math.PI);

  return {
    azimuthDeg: azimuthDeg < 0 ? azimuthDeg + 360 : azimuthDeg,
    elevationDeg,
  };
}

function makeBearing(
  azimuthDeg: number,
  elevationDeg: number,
  sensorId: string,
  timestamp: number = 1000,
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

describe('triangulateTwoBearings', () => {
  it('should triangulate target position from two sensors with known bearings', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const bearing1 = makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1');
    const bearing2 = makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2');

    const result = triangulateTwoBearings(EO1, bearing1, EO2, bearing2);

    // Position should be close to the known target
    const distError = haversineDistanceM(
      result.position.lat,
      result.position.lon,
      TARGET.lat,
      TARGET.lon,
    );

    expect(distError).toBeLessThan(100); // within 100 meters horizontally
    expect(Math.abs(result.position.alt - TARGET.alt)).toBeLessThan(200); // within 200m vertically
    expect(result.numBearings).toBe(2);
    expect(result.intersectionAngleDeg).toBeGreaterThan(0);
  });

  it('should achieve high intersection angle for well-separated sensors', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const bearing1 = makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1');
    const bearing2 = makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2');

    const result = triangulateTwoBearings(EO1, bearing1, EO2, bearing2);

    // With a 35km baseline viewing a target at ~20-30km, we should get a decent angle
    expect(result.intersectionAngleDeg).toBeGreaterThan(10);
  });

  it('should produce small miss distance for perfect bearings', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const bearing1 = makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1');
    const bearing2 = makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2');

    const result = triangulateTwoBearings(EO1, bearing1, EO2, bearing2);

    // Perfect bearings should produce small miss distance
    // (non-zero due to ENU coordinate conversion at long ranges ~30km)
    expect(result.averageMissDistance).toBeLessThan(150);
  });
});

describe('triangulateMultiple', () => {
  it('should triangulate from 3 sensors with known bearings', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);
    const b3 = computeTrueBearing(EO3, TARGET);

    const bearings = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
      makeBearing(b3.azimuthDeg, b3.elevationDeg, 'EO-3'),
    ];

    const result = triangulateMultiple([EO1, EO2, EO3], bearings);

    const distError = haversineDistanceM(
      result.position.lat,
      result.position.lon,
      TARGET.lat,
      TARGET.lon,
    );

    expect(distError).toBeLessThan(100);
    expect(Math.abs(result.position.alt - TARGET.alt)).toBeLessThan(200);
    expect(result.numBearings).toBe(3);
    expect(result.residualCovariance).toBeDefined();
  });

  it('should achieve better intersection angle with 3 sensors forming a triangle', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);
    const b3 = computeTrueBearing(EO3, TARGET);

    const bearings2 = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    ];
    const result2 = triangulateMultiple([EO1, EO2], bearings2);

    const bearings3 = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
      makeBearing(b3.azimuthDeg, b3.elevationDeg, 'EO-3'),
    ];
    const result3 = triangulateMultiple([EO1, EO2, EO3], bearings3);

    // Best pairwise angle with 3 sensors should be >= angle with 2 sensors
    expect(result3.intersectionAngleDeg).toBeGreaterThanOrEqual(
      result2.intersectionAngleDeg - 0.01,
    );
  });

  it('should produce residual covariance for 3+ bearings', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);
    const b3 = computeTrueBearing(EO3, TARGET);

    const bearings = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
      makeBearing(b3.azimuthDeg, b3.elevationDeg, 'EO-3'),
    ];

    const result = triangulateMultiple([EO1, EO2, EO3], bearings);

    expect(result.residualCovariance).toBeDefined();
    expect(result.residualCovariance!.length).toBe(3);
    expect(result.residualCovariance![0].length).toBe(3);

    // Diagonal should be non-negative (variances)
    expect(result.residualCovariance![0][0]).toBeGreaterThanOrEqual(0);
    expect(result.residualCovariance![1][1]).toBeGreaterThanOrEqual(0);
    expect(result.residualCovariance![2][2]).toBeGreaterThanOrEqual(0);
  });

  it('should throw for fewer than 2 bearings', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const bearings = [makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1')];

    expect(() => triangulateMultiple([EO1], bearings)).toThrow();
  });

  it('should throw when sensorPositions and bearings have different lengths', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const bearings = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-2'),
    ];

    expect(() => triangulateMultiple([EO1], bearings)).toThrow();
  });

  it('should fall back to 2-bearing for exactly 2 inputs', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const bearings = [
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    ];

    const result = triangulateMultiple([EO1, EO2], bearings);
    expect(result.numBearings).toBe(2);
  });
});
