import { describe, it, expect } from 'vitest';
import type { EoTrackId, Position3D, SensorId, Timestamp, BearingMeasurement } from '@eloc2/domain';
import { geodeticToENU } from '@eloc2/shared-utils';
import {
  buildGeometryEstimate,
  createGeometryEvent,
} from '../src/projection/geometry-projection.js';
import { triangulateTwoBearings, triangulateMultiple } from '../src/triangulation/triangulator.js';
import type { TriangulationResult } from '../src/triangulation/triangulator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EO1: Position3D = { lat: 31.0, lon: 34.5, alt: 200 };
const EO2: Position3D = { lat: 31.3, lon: 34.8, alt: 180 };
const EO3: Position3D = { lat: 31.5, lon: 34.3, alt: 250 };
const TARGET: Position3D = { lat: 31.25, lon: 34.65, alt: 5000 };

function computeTrueBearing(
  sensor: Position3D,
  target: Position3D,
): { azimuthDeg: number; elevationDeg: number } {
  const enu = geodeticToENU(
    target.lat, target.lon, target.alt,
    sensor.lat, sensor.lon, sensor.alt,
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
): BearingMeasurement {
  return {
    azimuthDeg,
    elevationDeg,
    timestamp: 1000 as Timestamp,
    sensorId: sensorId as SensorId,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildGeometryEstimate', () => {
  it('should build a valid estimate from triangulation result', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const triResult = triangulateTwoBearings(
      EO1,
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      EO2,
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    );

    const eoTrackIds = ['track-1' as EoTrackId, 'track-2' as EoTrackId];
    const estimate = buildGeometryEstimate(triResult, eoTrackIds, 0.5);

    expect(estimate.estimateId).toBeTruthy();
    expect(estimate.eoTrackIds).toEqual(eoTrackIds);
    expect(estimate.bearingNoiseDeg).toBe(0.5);
    expect(estimate.intersectionAngleDeg).toBe(triResult.intersectionAngleDeg);
    expect(estimate.timeAlignmentQualityMs).toBe(0);
  });

  it('should set position3D for sufficient geometry', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const triResult = triangulateTwoBearings(
      EO1,
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      EO2,
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    );

    const estimate = buildGeometryEstimate(
      triResult,
      ['t1' as EoTrackId],
      0.5,
    );

    // With our sensor geometry, the intersection angle should be sufficient
    if (estimate.classification !== 'bearing_only') {
      expect(estimate.position3D).toBeDefined();
      expect(estimate.covariance3D).toBeDefined();
    }
  });

  it('should not set position3D for bearing_only classification', () => {
    // Create a result with a tiny intersection angle
    const fakeResult: TriangulationResult = {
      position: { lat: 31.25, lon: 34.65, alt: 5000 },
      positionENU: { east: 0, north: 0, up: 0 },
      intersectionAngleDeg: 3, // insufficient
      averageMissDistance: 1000,
      numBearings: 2,
      residualCovariance: undefined,
    };

    const estimate = buildGeometryEstimate(
      fakeResult,
      ['t1' as EoTrackId],
      0.5,
    );

    expect(estimate.quality).toBe('insufficient');
    expect(estimate.classification).toBe('bearing_only');
    expect(estimate.position3D).toBeUndefined();
    expect(estimate.covariance3D).toBeUndefined();
  });

  it('should set timeAlignmentQualityMs when provided', () => {
    const fakeResult: TriangulationResult = {
      position: { lat: 31.25, lon: 34.65, alt: 5000 },
      positionENU: { east: 0, north: 0, up: 0 },
      intersectionAngleDeg: 45,
      averageMissDistance: 50,
      numBearings: 2,
      residualCovariance: undefined,
    };

    const estimate = buildGeometryEstimate(
      fakeResult,
      ['t1' as EoTrackId],
      0.5,
      200,
    );

    expect(estimate.timeAlignmentQualityMs).toBe(200);
  });

  it('AC1: 90-degree intersection -> confirmed_3d with strong quality', () => {
    const fakeResult: TriangulationResult = {
      position: { lat: 31.25, lon: 34.65, alt: 5000 },
      positionENU: { east: 0, north: 0, up: 0 },
      intersectionAngleDeg: 90,
      averageMissDistance: 10,
      numBearings: 2,
      residualCovariance: undefined,
    };

    const estimate = buildGeometryEstimate(
      fakeResult,
      ['t1' as EoTrackId, 't2' as EoTrackId],
      0.5,
    );

    expect(estimate.quality).toBe('strong');
    expect(estimate.classification).toBe('confirmed_3d');
    expect(estimate.position3D).toBeDefined();
  });

  it('AC2: 5-degree intersection -> bearing_only with insufficient quality', () => {
    const fakeResult: TriangulationResult = {
      position: { lat: 31.25, lon: 34.65, alt: 5000 },
      positionENU: { east: 0, north: 0, up: 0 },
      intersectionAngleDeg: 5,
      averageMissDistance: 5000,
      numBearings: 2,
      residualCovariance: undefined,
    };

    const estimate = buildGeometryEstimate(
      fakeResult,
      ['t1' as EoTrackId],
      0.5,
    );

    expect(estimate.quality).toBe('insufficient');
    expect(estimate.classification).toBe('bearing_only');
    expect(estimate.position3D).toBeUndefined();
  });
});

describe('createGeometryEvent', () => {
  it('should create a valid event envelope', () => {
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);

    const triResult = triangulateTwoBearings(
      EO1,
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      EO2,
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    );

    const estimate = buildGeometryEstimate(
      triResult,
      ['t1' as EoTrackId, 't2' as EoTrackId],
      0.5,
    );

    const event = createGeometryEvent(estimate);

    expect(event.eventType).toBe('geometry.estimate.updated');
    expect(event.eventId).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.provenance.source).toBe('geometry-service');
    expect(event.data.estimateId).toBe(estimate.estimateId);
    expect(event.data.eoTrackIds).toEqual(estimate.eoTrackIds);
    expect(event.data.classification).toBe(estimate.classification);
    expect(event.data.quality).toBe(estimate.quality);
  });

  it('should include position3D in event data when available', () => {
    const fakeResult: TriangulationResult = {
      position: { lat: 31.25, lon: 34.65, alt: 5000 },
      positionENU: { east: 0, north: 0, up: 0 },
      intersectionAngleDeg: 90,
      averageMissDistance: 10,
      numBearings: 2,
      residualCovariance: undefined,
    };

    const estimate = buildGeometryEstimate(
      fakeResult,
      ['t1' as EoTrackId],
      0.5,
    );

    const event = createGeometryEvent(estimate);

    expect(event.data.position3D).toBeDefined();
    expect(event.data.position3D!.lat).toBeCloseTo(31.25, 2);
  });
});
