import { SimulationClock } from '@eloc2/shared-utils';

const clock = new SimulationClock(Date.now());

export { clock };

// Scenario types
export type {
  WaypointDef,
  TargetDefinition,
  SensorDefinition,
  FaultDefinition,
  OperatorActionDef,
  ScenarioDefinition,
} from './types/scenario.js';

// Engine
export {
  ScenarioRunner,
} from './engine/scenario-runner.js';
export type {
  SimulationState,
  SimulationEvent,
} from './engine/scenario-runner.js';

// Target generator
export {
  interpolatePosition,
  interpolateVelocity,
  isTargetActive,
} from './targets/target-generator.js';

// Sensor models
export {
  generateRadarObservation,
  generateClutterFalseAlarms,
} from './sensors/radar/radar-model.js';
export type { RadarObservation } from './sensors/radar/radar-model.js';

export {
  generateEoBearing,
} from './sensors/eo/eo-model.js';
export type { EoBearingObservation } from './sensors/eo/eo-model.js';

export {
  generateC4isrObservation,
} from './sensors/c4isr-source/c4isr-model.js';

// Fault manager
export {
  getActiveFaults,
  applyAzimuthBias,
  applyClockDrift,
  isSensorInOutage,
} from './faults/fault-manager.js';
