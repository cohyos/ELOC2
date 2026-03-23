// Types
export type {
  EoCoreTrack,
  TriangulationOutput,
  EoCoreConfig,
} from './types.js';

// Core entity
export { EoCoreEntity } from './eo-core.js';

// Components
export { BearingAggregator } from './bearing-aggregator.js';
export { triangulateFromBearings } from './triangulator.js';
export { EoTrackManager } from './eo-track-manager.js';

// Investigator
export {
  InvestigatorCoordinator,
  type EoSensorInfo,
  type TaskableTrack,
  type TaskAssignment,
  type InvestigatorConfig,
} from './investigator-coordinator.js';
