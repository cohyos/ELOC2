import { describe, it, expect } from 'vitest';
import type { BearingMeasurement, Position3D, SensorId, Timestamp } from '@eloc2/domain';
import { bearingDeg, haversineDistanceM } from '@eloc2/shared-utils';
import {
  computeBearingRay,
  intersectRays,
  computeIntersectionAngle,
} from '../src/bearings/bearing-math.js';

// ---------------------------------------------------------------------------
// Test fixtures — central Israel
// ---------------------------------------------------------------------------

const EO1: Position3D = { lat: 31.0, lon: 34.5, alt: 200 };
const EO2: Position3D = { lat: 31.3, lon: 34.8, alt: 180 };
const EO3: Position3D = { lat: 31.5, lon: 34.3, alt: 250 };
const TARGET: Position3D = { lat: 31.25, lon: 34.65, alt: 5000 };

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

describe('computeBearingRay', () => {
  it('should produce a unit direction vector', () => {
    const bearing = makeBearing(45, 10, 'EO-1');
    const ray = computeBearingRay(EO1, bearing, EO1);

    const mag = Math.sqrt(
      ray.direction.east ** 2 +
      ray.direction.north ** 2 +
      ray.direction.up ** 2,
    );

    expect(mag).toBeCloseTo(1.0, 10);
  });

  it('should have origin at (0,0,0) when sensor is the reference', () => {
    const bearing = makeBearing(0, 0, 'EO-1');
    const ray = computeBearingRay(EO1, bearing, EO1);

    expect(ray.origin.east).toBeCloseTo(0, 5);
    expect(ray.origin.north).toBeCloseTo(0, 5);
    expect(ray.origin.up).toBeCloseTo(0, 5);
  });

  it('should point north for azimuth=0, elevation=0', () => {
    const bearing = makeBearing(0, 0, 'EO-1');
    const ray = computeBearingRay(EO1, bearing, EO1);

    expect(ray.direction.north).toBeCloseTo(1.0, 10);
    expect(ray.direction.east).toBeCloseTo(0, 10);
    expect(ray.direction.up).toBeCloseTo(0, 10);
  });

  it('should point east for azimuth=90, elevation=0', () => {
    const bearing = makeBearing(90, 0, 'EO-1');
    const ray = computeBearingRay(EO1, bearing, EO1);

    expect(ray.direction.east).toBeCloseTo(1.0, 10);
    expect(ray.direction.north).toBeCloseTo(0, 10);
    expect(ray.direction.up).toBeCloseTo(0, 10);
  });

  it('should have positive up component for positive elevation', () => {
    const bearing = makeBearing(45, 30, 'EO-1');
    const ray = computeBearingRay(EO1, bearing, EO1);

    expect(ray.direction.up).toBeGreaterThan(0);
  });

  it('should produce non-zero origin for a different sensor position', () => {
    const bearing = makeBearing(45, 10, 'EO-2');
    const ray = computeBearingRay(EO2, bearing, EO1);

    const dist = Math.sqrt(
      ray.origin.east ** 2 + ray.origin.north ** 2 + ray.origin.up ** 2,
    );
    expect(dist).toBeGreaterThan(1000); // EO2 is ~35km from EO1
  });
});

describe('intersectRays', () => {
  it('should find the closest point of approach for perpendicular rays', () => {
    // Two rays that cross near the origin
    const ray1 = {
      origin: { east: -100, north: 0, up: 0 },
      direction: { east: 1, north: 0, up: 0 },
    };
    const ray2 = {
      origin: { east: 0, north: -100, up: 0 },
      direction: { east: 0, north: 1, up: 0 },
    };

    const result = intersectRays(ray1, ray2);

    expect(result.midpoint.east).toBeCloseTo(0, 5);
    expect(result.midpoint.north).toBeCloseTo(0, 5);
    expect(result.missDistance).toBeCloseTo(0, 5);
    expect(result.intersectionAngleDeg).toBeCloseTo(90, 5);
  });

  it('should compute correct intersection angle for 45-degree rays', () => {
    const ray1 = {
      origin: { east: -100, north: 0, up: 0 },
      direction: { east: 1, north: 0, up: 0 },
    };
    const s = Math.SQRT1_2;
    const ray2 = {
      origin: { east: 0, north: -100, up: 0 },
      direction: { east: s, north: s, up: 0 },
    };

    const result = intersectRays(ray1, ray2);
    expect(result.intersectionAngleDeg).toBeCloseTo(45, 5);
  });

  it('should return small miss distance for nearly intersecting rays', () => {
    // Offset slightly in the up direction
    const ray1 = {
      origin: { east: -100, north: 0, up: 1 },
      direction: { east: 1, north: 0, up: 0 },
    };
    const ray2 = {
      origin: { east: 0, north: -100, up: -1 },
      direction: { east: 0, north: 1, up: 0 },
    };

    const result = intersectRays(ray1, ray2);
    expect(result.missDistance).toBeCloseTo(2, 5);
  });

  it('should handle parallel rays gracefully', () => {
    const ray1 = {
      origin: { east: 0, north: 0, up: 0 },
      direction: { east: 1, north: 0, up: 0 },
    };
    const ray2 = {
      origin: { east: 0, north: 100, up: 0 },
      direction: { east: 1, north: 0, up: 0 },
    };

    const result = intersectRays(ray1, ray2);
    expect(result.intersectionAngleDeg).toBeCloseTo(0, 3);
  });
});

describe('computeIntersectionAngle', () => {
  it('should return 90 for perpendicular vectors', () => {
    const angle = computeIntersectionAngle(
      { east: 1, north: 0, up: 0 },
      { east: 0, north: 1, up: 0 },
    );
    expect(angle).toBeCloseTo(90, 5);
  });

  it('should return 0 for parallel vectors', () => {
    const angle = computeIntersectionAngle(
      { east: 1, north: 0, up: 0 },
      { east: 1, north: 0, up: 0 },
    );
    expect(angle).toBeCloseTo(0, 5);
  });

  it('should return 0 for antiparallel vectors (acute angle)', () => {
    const angle = computeIntersectionAngle(
      { east: 1, north: 0, up: 0 },
      { east: -1, north: 0, up: 0 },
    );
    expect(angle).toBeCloseTo(0, 5);
  });

  it('should return 45 for vectors at 45 degrees', () => {
    const s = Math.SQRT1_2;
    const angle = computeIntersectionAngle(
      { east: 1, north: 0, up: 0 },
      { east: s, north: s, up: 0 },
    );
    expect(angle).toBeCloseTo(45, 5);
  });

  it('should return 60 for vectors at 60 degrees', () => {
    const angle = computeIntersectionAngle(
      { east: 1, north: 0, up: 0 },
      { east: 0.5, north: Math.sqrt(3) / 2, up: 0 },
    );
    expect(angle).toBeCloseTo(60, 5);
  });
});
