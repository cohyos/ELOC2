// Types
export type { SensorInstanceConfig, SensorTickResult } from './types.js';

// Observation generator interfaces (for decoupling from simulator)
export type {
  SensorSpec,
  FaultSpec,
  EoBearingResult,
  EoBearingGenerator,
  RadarObservationResult,
  RadarObservationGenerator,
  C4isrObservationResult,
  C4isrObservationGenerator,
} from './types.js';

// Base class
export { SensorInstance } from './base-sensor.js';

// Concrete sensor classes
export { RadarSensorInstance } from './radar-sensor.js';
export { EoSensorInstance } from './eo-sensor.js';
export { C4isrSensorInstance } from './c4isr-sensor.js';

// Factory
export {
  registerSensorType,
  createSensorInstance,
  createSensorInstances,
} from './sensor-factory.js';
export type { ObservationGenerators } from './sensor-factory.js';
