// Types
export type {
  FusedSystemTrack,
  SystemFuserConfig,
} from './types.js';
export { DEFAULT_SYSTEM_FUSER_CONFIG } from './types.js';

// System fuser
export { SystemFuser } from './system-fuser.js';

// Distributed pipeline orchestrator
export { DistributedPipeline } from './distributed-pipeline.js';
export type {
  DistributedPipelineConfig,
  PipelineTickResult,
} from './distributed-pipeline.js';

// Trajectory classifier
export {
  classifyByTrajectory,
  shouldApplyTrajectoryClassification,
} from './trajectory-classifier.js';
export type { TrajectoryClassificationResult } from './trajectory-classifier.js';

// Lifecycle management
export { LifecycleManager } from './lifecycle-manager.js';
export type {
  PipelineState,
  LifecycleEvent,
  LifecycleManagerConfig,
  Disposable,
} from './lifecycle-manager.js';
