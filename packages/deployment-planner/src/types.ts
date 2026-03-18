/**
 * Types for the deployment planner module.
 */

/** A 2D geographic point (lat/lon). */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** A polygon defined by an array of vertices (lat/lon). */
export type GeoPolygon = GeoPoint[];

/** A grid cell for deployment candidate evaluation. */
export interface GridCell {
  index: number;
  center: GeoPoint;
  /** Row in the grid */
  row: number;
  /** Column in the grid */
  col: number;
}

/** Definition of a sensor to be placed. */
export interface SensorSpec {
  id: string;
  type: 'radar' | 'eo';
  /** Maximum detection range in meters. */
  maxRangeM: number;
  /** Field of view half-angle in degrees (for EO sensors). */
  fovHalfAngleDeg: number;
  /** Coverage arc min azimuth (degrees). */
  minAzDeg: number;
  /** Coverage arc max azimuth (degrees). */
  maxAzDeg: number;
}

/** Constraints for deployment optimization. */
export interface DeploymentConstraints {
  /** Area to scan / defend (polygon boundary). */
  scannedArea: GeoPolygon;
  /** Zones where sensors MUST be placed. */
  inclusionZones: GeoPolygon[];
  /** Zones where sensors CANNOT be placed. */
  exclusionZones: GeoPolygon[];
  /** Threat corridors: polygons where coverage is prioritized. */
  threatCorridors: GeoPolygon[];
  /** Minimum coverage percentage required. */
  minCoveragePercent: number;
  /** Grid resolution in meters (cell size). */
  gridResolutionM: number;
}

/** A placed sensor with its position and score breakdown. */
export interface PlacedSensor {
  spec: SensorSpec;
  position: GeoPoint;
  scores: {
    coverage: number;
    geometry: number;
    threat: number;
    total: number;
  };
}

/** Result of the optimization algorithm. */
export interface DeploymentResult {
  placedSensors: PlacedSensor[];
  metrics: DeploymentMetrics;
}

/** Aggregate metrics for a deployment. */
export interface DeploymentMetrics {
  /** Percentage of scanned area covered by at least one sensor. */
  coveragePercent: number;
  /** Percentage of area with triangulation potential (2+ sensors). */
  triangulationCoveragePercent: number;
  /** Worst-case gap: largest uncovered area radius in meters. */
  worstCaseGapM: number;
  /** Average geometry quality (intersection angle quality 0-1). */
  geometryQuality: number;
}

/** Saved deployment plan. */
export interface SavedDeployment {
  id: string;
  name: string;
  createdAt: string;
  constraints: DeploymentConstraints;
  sensors: SensorSpec[];
  result: DeploymentResult;
}
