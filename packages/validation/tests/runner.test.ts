import { describe, it, expect, beforeEach } from 'vitest';
import { runValidation } from '../src/runner.js';
import type { EventEnvelope } from '@eloc2/events';
import {
  makeSystemTrackUpdated,
  makeRegistrationStateUpdated,
  makeTaskDecided,
  makeGeometryEstimateUpdated,
  makeUnresolvedGroupCreated,
  makeUnresolvedGroupResolved,
  resetCounter,
} from './helpers.js';

function buildCompleteScenario(): EventEnvelope[] {
  return [
    // System tracks
    makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5, timestamp: 500 }),
    makeSystemTrackUpdated({ systemTrackId: 'T2', sourcesUsed: ['S2'], confidenceChange: 0.5, timestamp: 600 }),

    // Registration: good before bias, degraded after
    makeRegistrationStateUpdated({ timestamp: 500, spatialQuality: 'good', fusionSafe: true }),
    makeRegistrationStateUpdated({ timestamp: 1500, spatialQuality: 'degraded', fusionSafe: false }),

    // System track confidence drops after bias
    makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: -0.3, timestamp: 1600 }),

    // Tasks with valid scores
    makeTaskDecided({ taskId: 'task-1', scoreTotal: 3.5 }),
    makeTaskDecided({ taskId: 'task-2', scoreTotal: 4.0 }),

    // Geometry estimates — all honest
    makeGeometryEstimateUpdated({ quality: 'strong', classification: 'confirmed_3d' }),
    makeGeometryEstimateUpdated({ quality: 'weak', classification: 'bearing_only' }),

    // Ambiguity groups — all resolved
    makeUnresolvedGroupCreated({ groupId: 'g1', timestamp: 700 }),
    makeUnresolvedGroupResolved({ groupId: 'g1', timestamp: 900 }),
  ];
}

describe('runValidation', () => {
  beforeEach(() => resetCounter());

  it('produces a passing report for a complete valid scenario', () => {
    const events = buildCompleteScenario();

    const report = runValidation('scenario-1', events, {
      expectedTrackCount: 2,
      biasInjectionTime: 1000,
      finalTrackCount: 2,
    });

    expect(report.scenarioId).toBe('scenario-1');
    expect(report.results.trackContinuity.passed).toBe(true);
    expect(report.results.registrationSafety.passed).toBe(true);
    expect(report.results.taskExplanation.passed).toBe(true);
    expect(report.results.geometryHonesty.passed).toBe(true);
    expect(report.results.ambiguityHandling.passed).toBe(true);
    expect(report.results.replayFidelity.passed).toBe(true);
    expect(report.allPassed).toBe(true);
    expect(report.summary).toContain('All');
    expect(report.summary).toContain('scenario-1');
  });

  it('reports partial failures correctly', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5 }),
      makeGeometryEstimateUpdated({ quality: 'strong', classification: 'confirmed_3d' }),
    ];

    const report = runValidation('scenario-2', events, {
      expectedTrackCount: 1,
    });

    // Some assertions will fail (no tasks, no registration, no groups, missing event types)
    expect(report.allPassed).toBe(false);
    expect(report.results.trackContinuity.passed).toBe(true);
    expect(report.results.taskExplanation.passed).toBe(false);
    expect(report.results.ambiguityHandling.passed).toBe(false);
  });

  it('defaults finalTrackCount to expectedTrackCount', () => {
    const events = buildCompleteScenario();

    const report = runValidation('scenario-3', events, {
      expectedTrackCount: 2,
      biasInjectionTime: 1000,
      // finalTrackCount omitted — should default to expectedTrackCount
    });

    expect(report.results.replayFidelity.stateMatches).toBe(true);
  });

  it('includes timestamp in report', () => {
    const before = Date.now();
    const report = runValidation('scenario-4', buildCompleteScenario(), {
      expectedTrackCount: 2,
      biasInjectionTime: 1000,
    });
    const after = Date.now();

    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });
});
