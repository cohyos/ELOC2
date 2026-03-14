import { describe, it, expect } from 'vitest';
import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { centralizedFuse } from '../fusion/centralized-fuser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObservation(
  lat: number,
  lon: number,
  alt = 1000,
  covDiag = 100,
): SourceObservation {
  return {
    observationId: `obs-${Math.random().toString(36).slice(2, 8)}`,
    sensorId: 'sensor-1' as SensorId,
    timestamp: Date.now() as Timestamp,
    position: { lat, lon, alt },
    velocity: undefined,
    covariance: [
      [covDiag, 0, 0],
      [0, covDiag, 0],
      [0, 0, covDiag],
    ] as Covariance3x3,
    sensorFrame: 'radar',
  };
}

function makeSystemTrack(
  lat: number,
  lon: number,
  alt = 1000,
  covDiag = 100,
  confidence = 0.5,
): SystemTrack {
  return {
    systemTrackId: 'trk-1' as SystemTrackId,
    state: { lat, lon, alt },
    velocity: undefined,
    covariance: [
      [covDiag, 0, 0],
      [0, covDiag, 0],
      [0, 0, covDiag],
    ] as Covariance3x3,
    confidence,
    status: 'confirmed',
    lineage: [],
    lastUpdated: Date.now() as Timestamp,
    sources: ['sensor-1' as SensorId],
    eoInvestigationStatus: 'none',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('centralizedFuse', () => {
  it('should produce a valid fused state from two observations', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 100);
    const obs = makeObservation(32.001, 34.001, 1050, 100);

    const result = centralizedFuse(track, obs);

    expect(result.method).toBe('centralized_information_matrix');
    // Fused state should be between track and observation
    expect(result.state.lat).toBeGreaterThanOrEqual(32.0);
    expect(result.state.lat).toBeLessThanOrEqual(32.001);
    expect(result.state.lon).toBeGreaterThanOrEqual(34.0);
    expect(result.state.lon).toBeLessThanOrEqual(34.001);
  });

  it('should weight position toward the lower-uncertainty observation', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 1000); // high uncertainty
    const obs = makeObservation(32.01, 34.01, 1000, 10);   // low uncertainty

    const result = centralizedFuse(track, obs);

    // Fused position should be much closer to the observation (lower cov)
    const dToObs = Math.abs(result.state.lat - 32.01);
    const dToTrack = Math.abs(result.state.lat - 32.0);

    expect(dToObs).toBeLessThan(dToTrack);
  });

  it('should increase confidence after fusion', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 100, 0.5);
    const obs = makeObservation(32.001, 34.001, 1050, 100);

    const result = centralizedFuse(track, obs);

    expect(result.confidence).toBeGreaterThanOrEqual(track.confidence);
  });
});
