// Ingest
export { normalizeObservation, ingestLocalTrack } from './ingest/source-ingest.js';

// Correlation
export { correlate } from './correlation/correlator.js';
export type { CorrelationResult, CorrelatorConfig } from './correlation/correlator.js';

// Fusion
export { fuseObservation, fuseWithRegistration } from './fusion/fuser.js';
export type { FusedState } from './fusion/fuser.js';

// Advanced fusion – mode selection
export { selectFusionMode } from './fusion/fusion-mode-selector.js';
export type { FusionMode, FusionModeDecision } from './fusion/fusion-mode-selector.js';

// Advanced fusion – conservative (covariance intersection)
export { conservativeFuse } from './fusion/conservative-fuser.js';
export type { ConservativeFusionResult } from './fusion/conservative-fuser.js';

// Advanced fusion – centralized (information-matrix)
export { centralizedFuse } from './fusion/centralized-fuser.js';
export type { CentralizedFusionResult } from './fusion/centralized-fuser.js';

// Advanced fusion – async handler
export { asyncFuse } from './fusion/async-handler.js';
export type { AsyncFusionResult } from './fusion/async-handler.js';

// Track management
export { TrackManager } from './track-management/track-manager.js';
export type { TrackManagerConfig, ProcessObservationResult } from './track-management/track-manager.js';

// RAP projection
export { buildRapSnapshot } from './rap-projection/rap-builder.js';
export type { RapSnapshot } from './rap-projection/rap-builder.js';

// Replay / event store
export { EventStore } from './replay/event-store.js';
