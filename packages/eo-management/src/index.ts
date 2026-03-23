// EO Management Module — unified interface for EO processing
export { EoManagementModule } from './eo-module.js';

// Types
export type {
  EoModuleOutput,
  EoModuleStatus,
  EoModuleMode,
  OperatorCommand,
  OperatorCommandType,
  TrackEnrichment,
  SearchState,
  ConvergenceEntry,
  SensorAllocation,
  PipelineStatus,
  IngestConfig,
} from './types.js';
export { DEFAULT_INGEST_CONFIG, IFOV_THRESHOLD_MRAD, DEFAULT_SENSOR_IFOV_MRAD } from './types.js';

// Extracted services (portable, independently testable)
export { DwellManager } from './dwell-manager.js';
export type { DwellAssignment, DwellManagerConfig } from './dwell-manager.js';
export { SearchController } from './search-controller.js';
export type { SearchSensorState, SearchControllerConfig } from './search-controller.js';
export { ConvergenceMonitor } from './convergence-monitor.js';
export type { ConvergenceMeasurement, ConvergenceState, ConvergenceMonitorConfig } from './convergence-monitor.js';

// Sub-components (for advanced usage / testing)
export { TrackIngester } from './ingest.js';
export { ModeController } from './mode-controller.js';
export type { PipelineSelection, ModeDecision } from './mode-controller.js';
export { runSubPixelDetection } from './sub-pixel-pipeline.js';
export type { SubPixelResult } from './sub-pixel-pipeline.js';
export { runImagePipeline } from './image-pipeline.js';
export type { ImagePipelineResult } from './image-pipeline.js';
