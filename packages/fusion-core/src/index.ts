// Ingest
export { normalizeObservation, ingestLocalTrack } from './ingest/source-ingest.js';

// Correlation
export { correlate } from './correlation/correlator.js';
export type { CorrelationResult, CorrelatorConfig } from './correlation/correlator.js';

// Fusion
export { fuseObservation, fuseWithRegistration } from './fusion/fuser.js';
export type { FusedState } from './fusion/fuser.js';

// Track management
export { TrackManager } from './track-management/track-manager.js';
export type { TrackManagerConfig, ProcessObservationResult } from './track-management/track-manager.js';

// RAP projection
export { buildRapSnapshot } from './rap-projection/rap-builder.js';
export type { RapSnapshot } from './rap-projection/rap-builder.js';

// Replay / event store
export { EventStore } from './replay/event-store.js';
