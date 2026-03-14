export const VALIDATION_VERSION = '0.1.0';

// Assertion modules
export {
  assertTrackContinuity,
  type TrackContinuityResult,
} from './assertions/track-continuity.js';

export {
  assertRegistrationSafety,
  type RegistrationSafetyResult,
} from './assertions/registration-safety.js';

export {
  assertTaskExplanation,
  type TaskExplanationResult,
} from './assertions/task-explanation.js';

export {
  assertGeometryHonesty,
  type GeometryHonestyResult,
} from './assertions/geometry-honesty.js';

export {
  assertAmbiguityHandling,
  type AmbiguityHandlingResult,
} from './assertions/ambiguity-handling.js';

export {
  assertReplayFidelity,
  type ReplayFidelityResult,
} from './assertions/replay-fidelity.js';

// Validation runner
export {
  runValidation,
  type ValidationReport,
  type ValidationOptions,
} from './runner.js';
