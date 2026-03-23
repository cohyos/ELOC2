// Types
export type { SensorInstanceConfig, SensorTickResult } from './types.js';

// Base class
export { SensorInstance } from './base-sensor.js';

// Factory
export {
  registerSensorType,
  createSensorInstance,
  createSensorInstances,
} from './sensor-factory.js';
