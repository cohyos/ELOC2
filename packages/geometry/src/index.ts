export const GEOMETRY_VERSION = '0.1.0';

// Bearings
export {
  computeBearingRay,
  intersectRays,
  computeIntersectionAngle,
} from './bearings/bearing-math.js';
export type { Ray3D, RayIntersectionResult } from './bearings/bearing-math.js';

// Time alignment
export {
  alignBearings,
  estimateBearingRate,
  maxTimeSpreadMs,
} from './time-alignment/time-aligner.js';
export type { BearingRate } from './time-alignment/time-aligner.js';

// Triangulation
export {
  triangulateTwoBearings,
  triangulateMultiple,
} from './triangulation/triangulator.js';
export type { TriangulationResult } from './triangulation/triangulator.js';

// Quality
export {
  scoreQuality,
  classifyGeometry,
  estimateCovariance,
} from './quality/quality-scorer.js';

// Projection
export {
  buildGeometryEstimate,
  createGeometryEvent,
} from './projection/geometry-projection.js';

// Ballistic estimation
export {
  estimateLaunchPoint,
  estimateImpactPoint,
} from './ballistic/ballistic-estimator.js';
export type {
  BallisticEstimate,
  LaunchEstimate,
  ImpactEstimate,
} from './ballistic/ballistic-estimator.js';

// IR Detection
export {
  computeIrDetectionRange,
  checkIrDetection,
  computeExtinctionCoeff,
  atmosphericTransmission,
  computeIfovMrad,
  computeGsdM,
  STARING_SENSOR_PROFILE,
  INVESTIGATOR_SENSOR_PROFILE,
  STANDARD_ATMOSPHERE,
  GOOD_WEATHER_ATMOSPHERE,
  HAZY_ATMOSPHERE,
  RAIN_ATMOSPHERE,
} from './ir-detection.js';
export type {
  EoSensorSpec,
  EoSensorProfile,
  AtmosphereCondition,
  IrDetectionResult,
} from './ir-detection.js';
