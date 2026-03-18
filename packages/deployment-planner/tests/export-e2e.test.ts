import { describe, it, expect } from 'vitest';
import {
  optimize,
  generateGrid,
  filterCells,
  pointInPolygon,
  validateDeployment,
  exportToSensorDefinitions,
  intersectionAngleQuality,
  haversineDistance,
} from '../src/index.js';
import type {
  SensorSpec,
  DeploymentConstraints,
  GeoPolygon,
  GeoPoint,
  PlacedSensor,
  GridCell,
} from '../src/index.js';

// Central Israel area polygon (~31.5-32.5N, 34.5-35.5E)
const centralIsraelArea: GeoPolygon = [
  { lat: 31.5, lon: 34.5 },
  { lat: 31.5, lon: 35.5 },
  { lat: 32.5, lon: 35.5 },
  { lat: 32.5, lon: 34.5 },
];

// Three EO sensors for inventory
const eoSensors: SensorSpec[] = [
  {
    id: 'eo-alpha',
    type: 'eo',
    maxRangeM: 20_000,
    fovHalfAngleDeg: 5,
    minAzDeg: 0,
    maxAzDeg: 360,
  },
  {
    id: 'eo-bravo',
    type: 'eo',
    maxRangeM: 20_000,
    fovHalfAngleDeg: 5,
    minAzDeg: 0,
    maxAzDeg: 360,
  },
  {
    id: 'eo-charlie',
    type: 'eo',
    maxRangeM: 20_000,
    fovHalfAngleDeg: 5,
    minAzDeg: 0,
    maxAzDeg: 360,
  },
];

// Exclusion zone in center of the area
const centerExclusion: GeoPolygon = [
  { lat: 31.9, lon: 34.9 },
  { lat: 31.9, lon: 35.1 },
  { lat: 32.1, lon: 35.1 },
  { lat: 32.1, lon: 34.9 },
];

describe('Deployment-to-Scenario Export E2E', () => {
  describe('Full pipeline: define area -> optimize -> validate -> export', () => {
    it('places 3 EO sensors inside the scanned area with valid metrics', () => {
      const constraints: DeploymentConstraints = {
        scannedArea: centralIsraelArea,
        inclusionZones: [],
        exclusionZones: [],
        threatCorridors: [],
        minCoveragePercent: 30,
        gridResolutionM: 10_000,
      };

      const result = optimize(eoSensors, constraints);

      // All 3 sensors should be placed
      expect(result.placedSensors).toHaveLength(3);

      // Each sensor must have a valid lat/lon inside the scanned area
      for (const ps of result.placedSensors) {
        expect(pointInPolygon(ps.position, centralIsraelArea)).toBe(true);
        expect(ps.position.lat).toBeGreaterThanOrEqual(31.5);
        expect(ps.position.lat).toBeLessThanOrEqual(32.5);
        expect(ps.position.lon).toBeGreaterThanOrEqual(34.5);
        expect(ps.position.lon).toBeLessThanOrEqual(35.5);
      }

      // Coverage metrics must be computed and positive
      expect(result.metrics.coveragePercent).toBeGreaterThan(0);
      expect(result.metrics.coveragePercent).toBeLessThanOrEqual(100);
      expect(result.metrics.triangulationCoveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.metrics.triangulationCoveragePercent).toBeLessThanOrEqual(100);
    });

    it('exports optimized deployment to valid scenario sensor definitions', () => {
      const constraints: DeploymentConstraints = {
        scannedArea: centralIsraelArea,
        inclusionZones: [],
        exclusionZones: [],
        threatCorridors: [],
        minCoveragePercent: 30,
        gridResolutionM: 10_000,
      };

      const result = optimize(eoSensors, constraints);
      const defs = exportToSensorDefinitions(result.placedSensors);

      expect(defs).toHaveLength(3);

      for (const def of defs) {
        // Must have sensorId
        expect(def.sensorId).toBeDefined();
        expect(typeof def.sensorId).toBe('string');
        expect(def.sensorId.length).toBeGreaterThan(0);

        // Must be EO type
        expect(def.sensorType).toBe('eo');

        // Position must have lat, lon, alt
        expect(def.position.lat).toBeGreaterThanOrEqual(31.5);
        expect(def.position.lat).toBeLessThanOrEqual(32.5);
        expect(def.position.lon).toBeGreaterThanOrEqual(34.5);
        expect(def.position.lon).toBeLessThanOrEqual(35.5);
        expect(typeof def.position.alt).toBe('number');

        // Coverage fields must be present
        expect(def.coverage.maxRangeM).toBe(20_000);
        expect(typeof def.coverage.minAzDeg).toBe('number');
        expect(typeof def.coverage.maxAzDeg).toBe('number');
        expect(typeof def.coverage.minElDeg).toBe('number');
        expect(typeof def.coverage.maxElDeg).toBe('number');
      }
    });
  });

  describe('Constraint enforcement', () => {
    it('respects exclusion zones — no sensor placed inside exclusion', () => {
      const constraints: DeploymentConstraints = {
        scannedArea: centralIsraelArea,
        inclusionZones: [],
        exclusionZones: [centerExclusion],
        threatCorridors: [],
        minCoveragePercent: 30,
        gridResolutionM: 10_000,
      };

      const result = optimize(eoSensors, constraints);
      expect(result.placedSensors).toHaveLength(3);

      // No placed sensor should be inside the exclusion zone
      for (const ps of result.placedSensors) {
        expect(pointInPolygon(ps.position, centerExclusion)).toBe(false);
      }
    });

    it('respects inclusion zones — sensors only placed inside inclusion', () => {
      // Inclusion zone: southwest quadrant only
      const inclusionZone: GeoPolygon = [
        { lat: 31.5, lon: 34.5 },
        { lat: 31.5, lon: 35.0 },
        { lat: 32.0, lon: 35.0 },
        { lat: 32.0, lon: 34.5 },
      ];

      const constraints: DeploymentConstraints = {
        scannedArea: centralIsraelArea,
        inclusionZones: [inclusionZone],
        exclusionZones: [],
        threatCorridors: [],
        minCoveragePercent: 20,
        gridResolutionM: 10_000,
      };

      const result = optimize(eoSensors, constraints);
      expect(result.placedSensors).toHaveLength(3);

      // All sensors must be inside the inclusion zone
      for (const ps of result.placedSensors) {
        expect(pointInPolygon(ps.position, inclusionZone)).toBe(true);
      }
    });

    it('combined inclusion + exclusion zones are respected', () => {
      // Inclusion: south half of area
      const inclusionZone: GeoPolygon = [
        { lat: 31.5, lon: 34.5 },
        { lat: 31.5, lon: 35.5 },
        { lat: 32.0, lon: 35.5 },
        { lat: 32.0, lon: 34.5 },
      ];

      // Exclusion: small square inside inclusion
      const exclusionZone: GeoPolygon = [
        { lat: 31.65, lon: 34.9 },
        { lat: 31.65, lon: 35.1 },
        { lat: 31.85, lon: 35.1 },
        { lat: 31.85, lon: 34.9 },
      ];

      const constraints: DeploymentConstraints = {
        scannedArea: centralIsraelArea,
        inclusionZones: [inclusionZone],
        exclusionZones: [exclusionZone],
        threatCorridors: [],
        minCoveragePercent: 20,
        gridResolutionM: 10_000,
      };

      const result = optimize(eoSensors, constraints);
      expect(result.placedSensors.length).toBeGreaterThan(0);

      for (const ps of result.placedSensors) {
        expect(pointInPolygon(ps.position, inclusionZone)).toBe(true);
        expect(pointInPolygon(ps.position, exclusionZone)).toBe(false);
      }
    });
  });

  describe('Geometry quality scoring', () => {
    it('two sensors close together produce lower geometry quality than well-separated sensors', () => {
      // Use a smaller area and sensors with large range to ensure overlap
      const smallArea: GeoPolygon = [
        { lat: 31.8, lon: 34.8 },
        { lat: 31.8, lon: 35.2 },
        { lat: 32.2, lon: 35.2 },
        { lat: 32.2, lon: 34.8 },
      ];
      const cells = generateGrid(smallArea, 5_000);
      const bigRange: SensorSpec = { ...eoSensors[0], maxRangeM: 40_000 };

      // Close together: ~1km apart — bearings nearly co-linear for all cells
      const closeSensors: PlacedSensor[] = [
        {
          spec: bigRange,
          position: { lat: 32.0, lon: 35.0 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
        {
          spec: bigRange,
          position: { lat: 32.005, lon: 35.005 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
      ];

      // Well-separated: ~30km apart but both still cover the area center
      const farSensors: PlacedSensor[] = [
        {
          spec: bigRange,
          position: { lat: 31.85, lon: 34.85 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
        {
          spec: bigRange,
          position: { lat: 32.15, lon: 35.15 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
      ];

      const closeMetrics = validateDeployment(closeSensors, cells);
      const farMetrics = validateDeployment(farSensors, cells);

      // Both should have triangulation coverage
      expect(closeMetrics.triangulationCoveragePercent).toBeGreaterThan(0);
      expect(farMetrics.triangulationCoveragePercent).toBeGreaterThan(0);

      // Well-separated sensors should have better geometry quality
      expect(farMetrics.geometryQuality).toBeGreaterThan(closeMetrics.geometryQuality);
    });

    it('intersection angle quality peaks near 90 degrees', () => {
      const targetCell: GridCell = {
        index: 0,
        center: { lat: 32.0, lon: 35.0 },
        row: 0,
        col: 0,
      };

      // Sensors at 90-degree angle from target (north and east)
      const sensorNorth: GeoPoint = { lat: 32.2, lon: 35.0 };
      const sensorEast: GeoPoint = { lat: 32.0, lon: 35.2 };

      // Sensors nearly co-linear with target (both north, slightly offset)
      const sensorNorth2: GeoPoint = { lat: 32.2, lon: 35.0 };
      const sensorNorthSlightlyEast: GeoPoint = { lat: 32.2, lon: 35.01 };

      const quality90 = intersectionAngleQuality(sensorNorth, sensorEast, targetCell);
      const qualityNarrow = intersectionAngleQuality(sensorNorth2, sensorNorthSlightlyEast, targetCell);

      // 90-degree crossing should produce quality near 1.0
      expect(quality90).toBeGreaterThan(0.8);

      // Near-colinear sensors produce low quality
      expect(qualityNarrow).toBeLessThan(0.3);

      // 90 degrees should be clearly better
      expect(quality90).toBeGreaterThan(qualityNarrow);
    });
  });

  describe('Validation metrics', () => {
    it('computes coverage percentage for manually placed sensors', () => {
      const cells = generateGrid(centralIsraelArea, 10_000);

      const placed: PlacedSensor[] = [
        {
          spec: { ...eoSensors[0], maxRangeM: 30_000 },
          position: { lat: 32.0, lon: 35.0 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
      ];

      const metrics = validateDeployment(placed, cells);

      expect(metrics.coveragePercent).toBeGreaterThan(0);
      expect(metrics.coveragePercent).toBeLessThanOrEqual(100);
    });

    it('computes triangulation coverage when 2+ sensors overlap', () => {
      const cells = generateGrid(centralIsraelArea, 10_000);

      // Two sensors with overlapping coverage
      const placed: PlacedSensor[] = [
        {
          spec: { ...eoSensors[0], maxRangeM: 40_000 },
          position: { lat: 31.9, lon: 35.0 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
        {
          spec: { ...eoSensors[1], maxRangeM: 40_000 },
          position: { lat: 32.1, lon: 35.0 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
      ];

      const metrics = validateDeployment(placed, cells);

      // With overlapping 40km range sensors ~22km apart, there should be triangulation coverage
      expect(metrics.triangulationCoveragePercent).toBeGreaterThan(0);
      expect(metrics.geometryQuality).toBeGreaterThan(0);
    });

    it('computes worst-case gap for partial coverage', () => {
      // Use a smaller grid for faster computation
      const smallArea: GeoPolygon = [
        { lat: 31.5, lon: 34.5 },
        { lat: 31.5, lon: 35.0 },
        { lat: 32.0, lon: 35.0 },
        { lat: 32.0, lon: 34.5 },
      ];
      const cells = generateGrid(smallArea, 10_000);

      // Place one sensor with limited range — won't cover everything
      const placed: PlacedSensor[] = [
        {
          spec: { ...eoSensors[0], maxRangeM: 15_000 },
          position: { lat: 31.6, lon: 34.6 },
          scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
        },
      ];

      const metrics = validateDeployment(placed, cells);

      // There should be uncovered cells, so worstCaseGap > 0
      expect(metrics.coveragePercent).toBeLessThan(100);
      expect(metrics.worstCaseGapM).toBeGreaterThan(0);
    });
  });

  describe('Export format verification', () => {
    it('exported definitions have all required fields matching domain types', () => {
      const placed: PlacedSensor[] = [
        {
          spec: eoSensors[0],
          position: { lat: 31.8, lon: 34.8 },
          scores: { coverage: 0.8, geometry: 0.6, threat: 0.2, total: 0.7 },
        },
        {
          spec: eoSensors[1],
          position: { lat: 32.2, lon: 35.2 },
          scores: { coverage: 0.7, geometry: 0.5, threat: 0.3, total: 0.6 },
        },
      ];

      const defs = exportToSensorDefinitions(placed);

      expect(defs).toHaveLength(2);

      // Verify first definition structure
      const def0 = defs[0];
      expect(def0).toHaveProperty('sensorId');
      expect(def0).toHaveProperty('sensorType');
      expect(def0).toHaveProperty('position');
      expect(def0).toHaveProperty('coverage');

      // sensorId follows the expected pattern
      expect(def0.sensorId).toMatch(/^eo-deploy-\d+$/);

      // type matches
      expect(def0.sensorType).toBe('eo');

      // position has lat/lon/alt
      expect(def0.position).toEqual({
        lat: 31.8,
        lon: 34.8,
        alt: 0,
      });

      // coverage has all required fields
      expect(def0.coverage).toEqual({
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 20_000,
      });
    });

    it('exported sensor IDs are unique', () => {
      const placed: PlacedSensor[] = eoSensors.map((spec, i) => ({
        spec,
        position: { lat: 31.7 + i * 0.3, lon: 34.7 + i * 0.3 },
        scores: { coverage: 1, geometry: 0, threat: 0, total: 1 },
      }));

      const defs = exportToSensorDefinitions(placed);
      const ids = defs.map(d => d.sensorId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
