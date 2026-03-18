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

// Sub-components (for advanced usage / testing)
export { TrackIngester } from './ingest.js';
export { ModeController } from './mode-controller.js';
export type { PipelineSelection, ModeDecision } from './mode-controller.js';
export { runSubPixelDetection } from './sub-pixel-pipeline.js';
export type { SubPixelResult } from './sub-pixel-pipeline.js';
export { runImagePipeline } from './image-pipeline.js';
export type { ImagePipelineResult } from './image-pipeline.js';
