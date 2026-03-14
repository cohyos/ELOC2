import { describe, it, expect, beforeEach } from 'vitest';
import { assertRegistrationSafety } from '../src/assertions/registration-safety.js';
import {
  makeRegistrationStateUpdated,
  makeSystemTrackUpdated,
  resetCounter,
} from './helpers.js';

describe('assertRegistrationSafety', () => {
  beforeEach(() => resetCounter());

  it('passes when bias is detected, fusion degrades, and confidence drops', () => {
    const events = [
      // Before bias injection -- good state
      makeRegistrationStateUpdated({ timestamp: 500, spatialQuality: 'good', fusionSafe: true }),
      makeSystemTrackUpdated({ timestamp: 500, confidenceChange: 0.1 }),
      // After bias injection -- degraded
      makeRegistrationStateUpdated({ timestamp: 1500, spatialQuality: 'degraded', fusionSafe: false }),
      makeSystemTrackUpdated({ timestamp: 1500, confidenceChange: -0.3 }),
    ];

    const result = assertRegistrationSafety(events, 1000);
    expect(result.passed).toBe(true);
    expect(result.biasDetected).toBe(true);
    expect(result.fusionDegraded).toBe(true);
    expect(result.confidenceDropped).toBe(true);
  });

  it('fails when no degradation is observed after bias injection', () => {
    const events = [
      makeRegistrationStateUpdated({ timestamp: 1500, spatialQuality: 'good', fusionSafe: true }),
      makeSystemTrackUpdated({ timestamp: 1500, confidenceChange: 0.1 }),
    ];

    const result = assertRegistrationSafety(events, 1000);
    expect(result.passed).toBe(false);
    expect(result.biasDetected).toBe(false);
    expect(result.fusionDegraded).toBe(false);
    expect(result.confidenceDropped).toBe(false);
  });

  it('fails when fusion does not degrade despite bias detection', () => {
    const events = [
      makeRegistrationStateUpdated({ timestamp: 1500, spatialQuality: 'degraded', fusionSafe: true }),
      makeSystemTrackUpdated({ timestamp: 1500, confidenceChange: -0.2 }),
    ];

    const result = assertRegistrationSafety(events, 1000);
    expect(result.passed).toBe(false);
    expect(result.biasDetected).toBe(true);
    expect(result.fusionDegraded).toBe(false);
  });

  it('detects unsafe quality levels', () => {
    const events = [
      makeRegistrationStateUpdated({ timestamp: 2000, spatialQuality: 'unsafe', fusionSafe: false }),
      makeSystemTrackUpdated({ timestamp: 2000, confidenceChange: -0.5 }),
    ];

    const result = assertRegistrationSafety(events, 1000);
    expect(result.passed).toBe(true);
    expect(result.biasDetected).toBe(true);
  });

  it('ignores events before bias injection time', () => {
    const events = [
      makeRegistrationStateUpdated({ timestamp: 500, spatialQuality: 'unsafe', fusionSafe: false }),
      makeSystemTrackUpdated({ timestamp: 500, confidenceChange: -0.5 }),
    ];

    const result = assertRegistrationSafety(events, 1000);
    expect(result.passed).toBe(false);
    expect(result.biasDetected).toBe(false);
  });
});
