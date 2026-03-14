import { describe, it, expect } from 'vitest';
import type {
  RegistrationState,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import { selectFusionMode } from '../fusion/fusion-mode-selector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistration(
  overrides: Partial<RegistrationState> = {},
): RegistrationState {
  return {
    sensorId: 'sensor-1' as SensorId,
    spatialBias: { azimuthBiasDeg: 0, elevationBiasDeg: 0, rangeBiasM: 0 },
    clockBias: { offsetMs: 0, driftRateMs: 0 },
    spatialQuality: 'good',
    timingQuality: 'good',
    biasEstimateAge: 100,
    fusionSafe: true,
    lastUpdated: Date.now() as Timestamp,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectFusionMode', () => {
  it('should return confirmation_only when registration is unsafe', () => {
    const reg = makeRegistration({ fusionSafe: false });
    const decision = selectFusionMode(reg, 'radar', 0.5);

    expect(decision.mode).toBe('confirmation_only');
    expect(decision.confidence).toBe(0.5);
  });

  it('should return conservative_track_fusion for EO sensor', () => {
    const reg = makeRegistration();
    const decision = selectFusionMode(reg, 'eo', 0.7);

    expect(decision.mode).toBe('conservative_track_fusion');
    expect(decision.confidence).toBe(0.7);
  });

  it('should return centralized_measurement_fusion for good registration + radar', () => {
    const reg = makeRegistration();
    const decision = selectFusionMode(reg, 'radar', 0.8);

    expect(decision.mode).toBe('centralized_measurement_fusion');
    expect(decision.confidence).toBe(0.8);
  });

  it('should return conservative_track_fusion when registration is degraded', () => {
    const reg = makeRegistration({ spatialQuality: 'degraded' });
    const decision = selectFusionMode(reg, 'radar', 0.6);

    expect(decision.mode).toBe('conservative_track_fusion');
    expect(decision.confidence).toBe(0.6);
  });

  it('should return confirmation_only when no registration state is available', () => {
    const decision = selectFusionMode(undefined, 'radar', 0.4);

    expect(decision.mode).toBe('confirmation_only');
    expect(decision.confidence).toBe(0.4);
  });
});
