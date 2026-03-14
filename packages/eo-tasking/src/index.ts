// Candidate generation
export type { TaskCandidate } from './candidate-generation/generator.js';
export { generateCandidates } from './candidate-generation/generator.js';

// Scoring
export type { ScoringWeights } from './scoring/scorer.js';
export { DEFAULT_WEIGHTS, scoreCandidate } from './scoring/scorer.js';

// Policy engine
export type { OperatorOverride, TaskDecision } from './policy/policy-engine.js';
export { applyPolicy } from './policy/policy-engine.js';

// Operator controls
export { OperatorControlsService } from './operator-controls/controls.js';

// Assignment
export type { Assignment } from './assignment/assigner.js';
export { assignTasks } from './assignment/assigner.js';

// Timeline projection
export type { TaskTimelineEntry } from './timeline-projection/timeline.js';
export { buildTaskTimeline } from './timeline-projection/timeline.js';
