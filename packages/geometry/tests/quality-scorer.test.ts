import { describe, it, expect } from 'vitest';
import type { Position3D, SensorId, Timestamp, BearingMeasurement } from '@eloc2/domain';
import { geodeticToENU } from '@eloc2/shared-utils';
import {
  scoreQuality,
  classifyGeometry,
  estimateCovariance,
} from '../src/quality/quality-scorer.js';
import {
  triangulateTwoBearings,
  triangulateMultiple,
} from '../src/triangulation/triangulator.js';

// ---------------------------------------------------------------------------
// Test fixtures
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
// Tests: scoreQuality
// ---------------------------------------------------------------------------

describe('scoreQuality', () => {
  it('should return insufficient for <10 degrees', () => {
    expect(scoreQuality(0)).toBe('insufficient');
    expect(scoreQuality(5)).toBe('insufficient');
    expect(scoreQuality(9.99)).toBe('insufficient');
  });

  it('should return weak for 10-29 degrees', () => {
    expect(scoreQuality(10)).toBe('weak');
    expect(scoreQuality(20)).toBe('weak');
    expect(scoreQuality(29.99)).toBe('weak');
  });

  it('should return acceptable for 30-59 degrees', () => {
    expect(scoreQuality(30)).toBe('acceptable');
    expect(scoreQuality(45)).toBe('acceptable');
    expect(scoreQuality(59.99)).toBe('acceptable');
  });

  it('should return strong for >=60 degrees', () => {
    expect(scoreQuality(60)).toBe('strong');
    expect(scoreQuality(90)).toBe('strong');
  });
});

// ---------------------------------------------------------------------------
// Tests: classifyGeometry
// ---------------------------------------------------------------------------

describe('classifyGeometry', () => {
  it('should classify insufficient quality as bearing_only', () => {
    expect(classifyGeometry('insufficient', 2)).toBe('bearing_only');
    expect(classifyGeometry('insufficient', 3)).toBe('bearing_only');
  });

  it('should classify weak quality as candidate_3d (never confirmed_3d)', () => {
    expect(classifyGeometry('weak', 2)).toBe('candidate_3d');
    expect(classifyGeometry('weak', 3)).toBe('candidate_3d');
    expect(classifyGeometry('weak', 5)).toBe('candidate_3d');
  });

  it('should classify acceptable quality with 2 bearings as candidate_3d', () => {
    expect(classifyGeometry('acceptable', 2)).toBe('candidate_3d');
  });

  it('should classify acceptable quality with 3+ bearings as confirmed_3d', () => {
    expect(classifyGeometry('acceptable', 3)).toBe('confirmed_3d');
    expect(classifyGeometry('acceptable', 4)).toBe('confirmed_3d');
  });

  it('should classify strong quality as confirmed_3d', () => {
    expect(classifyGeometry('strong', 2)).toBe('confirmed_3d');
    expect(classifyGeometry('strong', 3)).toBe('confirmed_3d');
  });

  // Acceptance criteria
  it('AC1: 90-degree intersection -> confirmed_3d with strong quality', () => {
    const quality = scoreQuality(90);
    const classification = classifyGeometry(quality, 2);
    expect(quality).toBe('strong');
    expect(classification).toBe('confirmed_3d');
  });

  it('AC2: 5-degree intersection -> bearing_only with insufficient quality', () => {
    const quality = scoreQuality(5);
    const classification = classifyGeometry(quality, 2);
    expect(quality).toBe('insufficient');
    expect(classification).toBe('bearing_only');
  });

  it('AC3: third sensor can improve weak to acceptable', () => {
    // With 2 sensors at a weak angle (e.g., 20deg), quality is weak -> candidate_3d
    const quality2 = scoreQuality(20);
    const class2 = classifyGeometry(quality2, 2);
    expect(quality2).toBe('weak');
    expect(class2).toBe('candidate_3d');

    // Adding a 3rd sensor might improve the best pairwise angle to acceptable (e.g., 45deg)
    const quality3 = scoreQuality(45);
    const class3 = classifyGeometry(quality3, 3);
    expect(quality3).toBe('acceptable');
    expect(class3).toBe('confirmed_3d');
  });
});

// ---------------------------------------------------------------------------
// Tests: estimateCovariance
// ---------------------------------------------------------------------------

describe('estimateCovariance', () => {
  it('should return a 3x3 matrix', () => {
    const cov = estimateCovariance(45, 30000, 0.5);
    expect(cov.length).toBe(3);
    expect(cov[0].length).toBe(3);
    expect(cov[1].length).toBe(3);
    expect(cov[2].length).toBe(3);
  });

  it('should have positive diagonal entries', () => {
    const cov = estimateCovariance(45, 30000, 0.5);
    expect(cov[0][0]).toBeGreaterThan(0);
    expect(cov[1][1]).toBeGreaterThan(0);
    expect(cov[2][2]).toBeGreaterThan(0);
  });

  it('should produce larger covariance for smaller intersection angles', () => {
    const covNarrow = estimateCovariance(15, 30000, 0.5);
    const covWide = estimateCovariance(60, 30000, 0.5);

    // Along-range variance should be larger for narrow angles
    expect(covNarrow[1][1]).toBeGreaterThan(covWide[1][1]);
  });

  it('should produce larger covariance for larger bearing noise', () => {
    const covLow = estimateCovariance(45, 30000, 0.1);
    const covHigh = estimateCovariance(45, 30000, 1.0);

    expect(covHigh[0][0]).toBeGreaterThan(covLow[0][0]);
    expect(covHigh[1][1]).toBeGreaterThan(covLow[1][1]);
  });
});

// ---------------------------------------------------------------------------
// Integration: Acceptance Criteria with real geometry
// ---------------------------------------------------------------------------

describe('integration: acceptance criteria with real sensor geometry', () => {
  it('AC3 integration: third sensor improves quality', () => {
    // Two sensors with a narrow angle
    const b1 = computeTrueBearing(EO1, TARGET);
    const b2 = computeTrueBearing(EO2, TARGET);
    const b3 = computeTrueBearing(EO3, TARGET);

    const result2 = triangulateTwoBearings(
      EO1,
      makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
      EO2,
      makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
    );

    const result3 = triangulateMultiple(
      [EO1, EO2, EO3],
      [
        makeBearing(b1.azimuthDeg, b1.elevationDeg, 'EO-1'),
        makeBearing(b2.azimuthDeg, b2.elevationDeg, 'EO-2'),
        makeBearing(b3.azimuthDeg, b3.elevationDeg, 'EO-3'),
      ],
    );

    const quality2 = scoreQuality(result2.intersectionAngleDeg);
    const quality3 = scoreQuality(result3.intersectionAngleDeg);

    // The 3-sensor result should have at least as good quality
    const qualityOrder = ['insufficient', 'weak', 'acceptable', 'strong'];
    expect(qualityOrder.indexOf(quality3)).toBeGreaterThanOrEqual(
      qualityOrder.indexOf(quality2),
    );

    // And better classification potential due to more bearings
    const class3 = classifyGeometry(quality3, result3.numBearings);
    expect(class3).not.toBe('bearing_only');
  });
});
