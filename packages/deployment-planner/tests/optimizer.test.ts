import { describe, it, expect } from 'vitest';
import {
  optimize,
  generateGrid,
  pointInPolygon,
  filterCells,
  haversineDistance,
  coverageScore,
  isCellCovered,
  validateDeployment,
  exportToSensorDefinitions,
} from '../src/index.js';
import type { SensorSpec, DeploymentConstraints, GeoPolygon, GeoPoint } from '../src/index.js';

// A simple square polygon around central Israel (~30km x 30km)
const squareArea: GeoPolygon = [
  { lat: 31.5, lon: 34.5 },
  { lat: 31.5, lon: 35.0 },
  { lat: 32.0, lon: 35.0 },
  { lat: 32.0, lon: 34.5 },
];

const eoSensor: SensorSpec = {
  id: 'eo-1',
  type: 'eo',
  maxRangeM: 15_000,
  fovHalfAngleDeg: 5,
  minAzDeg: 0,
  maxAzDeg: 360,
};

const radarSensor: SensorSpec = {
  id: 'radar-1',
  type: 'radar',
  maxRangeM: 30_000,
  fovHalfAngleDeg: 180,
  minAzDeg: 0,
  maxAzDeg: 360,
};

describe('pointInPolygon', () => {
  it('detects point inside square', () => {
    expect(pointInPolygon({ lat: 31.75, lon: 34.75 }, squareArea)).toBe(true);
  });

  it('detects point outside square', () => {
    expect(pointInPolygon({ lat: 30.0, lon: 34.0 }, squareArea)).toBe(false);
  });
});

describe('generateGrid', () => {
  it('produces cells inside polygon', () => {
    const cells = generateGrid(squareArea, 5000);
    expect(cells.length).toBeGreaterThan(0);
    // All cells should be inside the polygon
    for (const cell of cells) {
      expect(pointInPolygon(cell.center, squareArea)).toBe(true);
    }
  });

  it('returns empty for degenerate polygon', () => {
    const cells = generateGrid([{ lat: 0, lon: 0 }], 1000);
    expect(cells).toHaveLength(0);
  });
});

describe('haversineDistance', () => {
  it('returns ~111km for 1 degree latitude', () => {
    const d = haversineDistance({ lat: 31.0, lon: 34.5 }, { lat: 32.0, lon: 34.5 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('returns 0 for same point', () => {
    const p: GeoPoint = { lat: 31.5, lon: 34.5 };
    expect(haversineDistance(p, p)).toBe(0);
  });
});

describe('filterCells', () => {
  it('excludes cells in exclusion zones', () => {
    const cells = generateGrid(squareArea, 10000);
    const exclusion: GeoPolygon = [
      { lat: 31.5, lon: 34.5 },
      { lat: 31.5, lon: 34.7 },
      { lat: 31.7, lon: 34.7 },
      { lat: 31.7, lon: 34.5 },
    ];
    const filtered = filterCells(cells, [], [exclusion]);
    // Some cells should have been removed
    expect(filtered.length).toBeLessThan(cells.length);
    // Remaining cells should NOT be in the exclusion zone
    for (const cell of filtered) {
      expect(pointInPolygon(cell.center, exclusion)).toBe(false);
    }
  });
});

describe('optimizer', () => {
  it('places sensors and returns valid positions', () => {
    const constraints: DeploymentConstraints = {
      scannedArea: squareArea,
      inclusionZones: [],
      exclusionZones: [],
      threatCorridors: [],
      minCoveragePercent: 50,
      gridResolutionM: 5000,
    };

    const result = optimize([eoSensor, radarSensor], constraints);

    expect(result.placedSensors).toHaveLength(2);

    // Each placed sensor should have a valid position inside the scanned area
    for (const ps of result.placedSensors) {
      expect(pointInPolygon(ps.position, squareArea)).toBe(true);
      expect(ps.scores.total).toBeGreaterThan(0);
    }

    // Metrics should be computed
    expect(result.metrics.coveragePercent).toBeGreaterThan(0);
  });

  it('handles empty sensor list', () => {
    const constraints: DeploymentConstraints = {
      scannedArea: squareArea,
      inclusionZones: [],
      exclusionZones: [],
      threatCorridors: [],
      minCoveragePercent: 50,
      gridResolutionM: 5000,
    };

    const result = optimize([], constraints);
    expect(result.placedSensors).toHaveLength(0);
    expect(result.metrics.coveragePercent).toBe(0);
  });

  it('places sensors avoiding exclusion zones', () => {
    const exclusion: GeoPolygon = [
      { lat: 31.6, lon: 34.6 },
      { lat: 31.6, lon: 34.9 },
      { lat: 31.9, lon: 34.9 },
      { lat: 31.9, lon: 34.6 },
    ];

    const constraints: DeploymentConstraints = {
      scannedArea: squareArea,
      inclusionZones: [],
      exclusionZones: [exclusion],
      threatCorridors: [],
      minCoveragePercent: 50,
      gridResolutionM: 5000,
    };

    const result = optimize([radarSensor], constraints);
    expect(result.placedSensors).toHaveLength(1);

    // Placed sensor should NOT be in the exclusion zone
    for (const ps of result.placedSensors) {
      expect(pointInPolygon(ps.position, exclusion)).toBe(false);
    }
  });
});

describe('validateDeployment', () => {
  it('computes metrics for placed sensors', () => {
    const cells = generateGrid(squareArea, 5000);
    const placed = [{
      spec: radarSensor,
      position: { lat: 31.75, lon: 34.75 },
      scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
    }];

    const metrics = validateDeployment(placed, cells);
    expect(metrics.coveragePercent).toBeGreaterThan(0);
    expect(metrics.coveragePercent).toBeLessThanOrEqual(100);
  });
});

describe('exportToSensorDefinitions', () => {
  it('converts placed sensors to scenario format', () => {
    const placed = [{
      spec: eoSensor,
      position: { lat: 31.75, lon: 34.75 },
      scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
    }];

    const defs = exportToSensorDefinitions(placed);
    expect(defs).toHaveLength(1);
    expect(defs[0].sensorType).toBe('eo');
    expect(defs[0].position.lat).toBe(31.75);
    expect(defs[0].coverage.maxRangeM).toBe(15_000);
  });
});
