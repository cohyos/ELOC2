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

// Existence calculator
export {
  updateExistenceOnDetection,
  updateExistenceOnMiss,
  computeTrackQuality,
} from './track-management/existence-calculator.js';
export type { TrackMetaForQuality } from './track-management/existence-calculator.js';

// Kalman filter
export { kalmanPredict, kalmanUpdate, defaultObservationMatrix3D } from './filters/kalman-filter.js';
export type { KalmanState } from './filters/kalman-filter.js';

// Motion models
export { constantVelocityModel, coordinatedTurnModel, ballisticModel, ballisticGravityInput } from './filters/motion-models.js';
export type { MotionModel } from './filters/motion-models.js';

// IMM filter
export {
  createIMMState,
  immPredict,
  immUpdate,
  immCombine,
  getActiveModel,
  defaultTransitionMatrix2,
  defaultTransitionMatrix3,
} from './filters/imm-filter.js';
export type { IMMState, IMMCombinedOutput } from './filters/imm-filter.js';

// Association — gating service
export { buildGatingMatrix, findClusters } from './association/gating-service.js';
export type { GatingConfig, GatingEntry, GatingMatrix, Cluster } from './association/gating-service.js';

// Association — JPDA
export { computeBetaCoefficients } from './association/jpda-associator.js';
export type { JPDAConfig, BetaCoefficients } from './association/jpda-associator.js';

// Association — JPDA updater
export { jpdaUpdate } from './association/jpda-updater.js';

// Association — IPDA
export { ipdaUpdate } from './association/ipda-associator.js';
export type { IPDAConfig, IPDAResult } from './association/ipda-associator.js';

// Association — selector
export { selectAssociationMode } from './association/association-selector.js';
export type { AssociationMode, AssociationConfig } from './association/association-selector.js';

// MHT
export { HypothesisNode } from './mht/hypothesis-node.js';
export { TrackHypothesisTree } from './mht/hypothesis-tree.js';
export type { GatedObservation, MHTConfig } from './mht/hypothesis-tree.js';
export { kBestPrune, ratioTestPrune, nScanPrune } from './mht/tree-pruner.js';
export { hungarianAssignment } from './mht/hungarian.js';
export type { AssignmentResult } from './mht/hungarian.js';
export { kBestAssignments } from './mht/murty-solver.js';
export type { MurtyAssignment } from './mht/murty-solver.js';
export { mhtAssociate } from './mht/mht-associator.js';
export type { MHTAssociatorConfig, MHTResult } from './mht/mht-associator.js';

// TBD
export { TBDManager } from './tbd/tbd-manager.js';
export type { TBDConfig } from './tbd/tbd-manager.js';
export { createTBDCandidate } from './tbd/tbd-candidate.js';
export type { TBDCandidate } from './tbd/tbd-candidate.js';

// Revisit scheduler
export { computeRevisitPriority, scheduleRevisits } from './scheduler/revisit-scheduler.js';
export type { RevisitPriority, RevisitSchedule, RevisitConfig } from './scheduler/revisit-scheduler.js';

// Covariance predictor
export { predictCovarianceGrowth, covarianceExceedsThreshold } from './scheduler/covariance-predictor.js';
export type { CovariancePrediction } from './scheduler/covariance-predictor.js';

// 6DOF Consistency evaluator
export { ConsistencyEvaluator } from './track-management/consistency-evaluator.js';
export type { ConsistencyConfig, ConsistencyResult, TrackStateSnapshot } from './track-management/consistency-evaluator.js';
