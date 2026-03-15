import type { EventEnvelope } from '@eloc2/events';
import {
  assertTrackContinuity,
  type TrackContinuityResult,
} from './assertions/track-continuity.js';
import {
  assertRegistrationSafety,
  type RegistrationSafetyResult,
} from './assertions/registration-safety.js';
import {
  assertTaskExplanation,
  type TaskExplanationResult,
} from './assertions/task-explanation.js';
import {
  assertGeometryHonesty,
  type GeometryHonestyResult,
} from './assertions/geometry-honesty.js';
import {
  assertAmbiguityHandling,
  type AmbiguityHandlingResult,
} from './assertions/ambiguity-handling.js';
import {
  assertReplayFidelity,
  type ReplayFidelityResult,
} from './assertions/replay-fidelity.js';

// ---------------------------------------------------------------------------
// Validation report
// ---------------------------------------------------------------------------

export interface ValidationReport {
  scenarioId: string;
  timestamp: number;
  results: {
    trackContinuity: TrackContinuityResult;
    registrationSafety: RegistrationSafetyResult;
    taskExplanation: TaskExplanationResult;
    geometryHonesty: GeometryHonestyResult;
    ambiguityHandling: AmbiguityHandlingResult;
    replayFidelity: ReplayFidelityResult;
  };
  allPassed: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// Validation runner
// ---------------------------------------------------------------------------

export interface ValidationOptions {
  expectedTrackCount: number;
  biasInjectionTime?: number;
  finalTrackCount?: number;
}

/**
 * Runs the full validation suite against a recorded event stream.
 */
export function runValidation(
  scenarioId: string,
  events: EventEnvelope[],
  options: ValidationOptions,
): ValidationReport {
  const {
    expectedTrackCount,
    biasInjectionTime = 0,
    finalTrackCount = expectedTrackCount,
  } = options;

  const trackContinuity = assertTrackContinuity(events, expectedTrackCount);
  const registrationSafety = assertRegistrationSafety(events, biasInjectionTime);
  const taskExplanation = assertTaskExplanation(events);
  const geometryHonesty = assertGeometryHonesty(events);
  const ambiguityHandling = assertAmbiguityHandling(events);
  const replayFidelity = assertReplayFidelity(events, finalTrackCount);

  const results = {
    trackContinuity,
    registrationSafety,
    taskExplanation,
    geometryHonesty,
    ambiguityHandling,
    replayFidelity,
  };

  const allPassed = Object.values(results).every((r) => r.passed);

  const passedCount = Object.values(results).filter((r) => r.passed).length;
  const totalCount = Object.values(results).length;

  const summary = allPassed
    ? `All ${totalCount} validation assertions passed for scenario ${scenarioId}`
    : `${passedCount}/${totalCount} validation assertions passed for scenario ${scenarioId}`;

  return {
    scenarioId,
    timestamp: Date.now(),
    results,
    allPassed,
    summary,
  };
}
