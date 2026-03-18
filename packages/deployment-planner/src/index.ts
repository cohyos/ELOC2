/**
 * @eloc2/deployment-planner
 *
 * EO sensor deployment planning and optimization module.
 * Provides greedy placement optimization, coverage scoring,
 * triangulation geometry analysis, and threat corridor assessment.
 */

// Core types
export type {
  GeoPoint,
  GeoPolygon,
  GridCell,
  SensorSpec,
  DeploymentConstraints,
  PlacedSensor,
  DeploymentResult,
  DeploymentMetrics,
  SavedDeployment,
} from './types.js';

// Grid
export { generateGrid, boundingBox, haversineDistance } from './grid.js';

// Constraints
export { pointInPolygon, filterCells } from './constraints.js';

// Scoring
export { coverageScore, isCellCovered } from './coverage-scorer.js';
export { geometryScore, intersectionAngleQuality } from './geometry-scorer.js';
export { threatScore } from './threat-scorer.js';

// Optimizer
export { optimize } from './optimizer.js';

// Validator
export { validateDeployment } from './validator.js';

// Export
export { exportToSensorDefinitions } from './export.js';
