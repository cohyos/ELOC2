// Cue handling
export { issueCue, isCueValid, predictState } from './cue-handling/cue-issuer.js';

// Gimbal model
export { GimbalController } from './gimbal-model/gimbal.js';

// FOV model
export { computeFovFootprint, isTargetInFov } from './fov-model/fov.js';

// EO reporting
export { createEoReport, handleEoReport } from './eo-reporting/report-handler.js';
export type { EoReportData } from './eo-reporting/report-handler.js';

// Ambiguity handling (Phase 5)
export { assessAmbiguity, updateHypotheses } from './ambiguity/ambiguity-handler.js';
export type {
  AssociationHypothesis,
  AmbiguityAssessment,
  HypothesisUpdateResult,
} from './ambiguity/ambiguity-handler.js';

// Split-merge (Phase 5)
export { splitGroup, clusterBearings } from './split-merge/splitter.js';
export type { SplitResult, ClusterOptions } from './split-merge/splitter.js';

export { mergeIntoGroup } from './split-merge/merger.js';
export type { MergeResult } from './split-merge/merger.js';

// Identification (Phase 5)
export { assessIdentification } from './identification/identifier.js';
