// Candidate generation
export type { TaskCandidate } from './candidate-generation/generator.js';
export { generateCandidates } from './candidate-generation/generator.js';

// Scoring
export type { ScoringWeights, ActiveBearing } from './scoring/scorer.js';
export { DEFAULT_WEIGHTS, scoreCandidate, computeIntersectionPotential } from './scoring/scorer.js';

// Policy engine
export type { OperatorOverride, TaskDecision } from './policy/policy-engine.js';
export { applyPolicy } from './policy/policy-engine.js';

// Operator controls
export { OperatorControlsService } from './operator-controls/controls.js';

// Assignment
export type { Assignment, CoordinationOptions } from './assignment/assigner.js';
export { assignTasks, computeIntersectionAngle, getActiveObservingEoSensors } from './assignment/assigner.js';

// Timeline projection
export type { TaskTimelineEntry } from './timeline-projection/timeline.js';
export { buildTaskTimeline } from './timeline-projection/timeline.js';
