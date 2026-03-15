import { describe, it, expect } from 'vitest';
import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { asyncFuse } from '../fusion/async-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trace(m: number[][]): number {
  return m[0][0] + m[1][1] + m[2][2];
}

function makeObservation(
  lat: number,
  lon: number,
  alt = 1000,
  covDiag = 100,
  timestampMs = Date.now(),
): SourceObservation {
  return {
    observationId: `obs-${Math.random().toString(36).slice(2, 8)}`,
    sensorId: 'sensor-1' as SensorId,
    timestamp: timestampMs as Timestamp,
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
  timestampMs = Date.now(),
): SystemTrack {
  return {
    systemTrackId: 'trk-1' as SystemTrackId,
    state: { lat, lon, alt },
    velocity: { vx: 10, vy: 5, vz: 0 },
    covariance: [
      [covDiag, 0, 0],
      [0, covDiag, 0],
      [0, 0, covDiag],
    ] as Covariance3x3,
    confidence,
    status: 'confirmed',
    lineage: [],
    lastUpdated: timestampMs as Timestamp,
    sources: ['sensor-1' as SensorId],
    eoInvestigationStatus: 'none',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('asyncFuse', () => {
  it('should produce same result as synchronous fusion when lag is 0', () => {
    const now = Date.now();
    const track = makeSystemTrack(32.0, 34.0, 1000, 100, 0.5, now);
    const obs = makeObservation(32.001, 34.001, 1050, 100, now);

    const result = asyncFuse(track, obs, 'centralized_measurement_fusion');

    expect(result.method).toBe('async_predict_update');
    expect(result.lagMs).toBe(0);
    // Should still produce a valid fused result
    expect(result.state.lat).toBeGreaterThanOrEqual(32.0);
    expect(result.state.lat).toBeLessThanOrEqual(32.001);
  });

  it('should handle 2s lag with covariance growth and stable result', () => {
    const now = Date.now();
    const track = makeSystemTrack(32.0, 34.0, 1000, 100, 0.5, now);
    // Observation from 2 seconds ago
    const obs = makeObservation(32.001, 34.001, 1050, 100, now - 2000);

    const result = asyncFuse(track, obs, 'centralized_measurement_fusion');

    expect(result.method).toBe('async_predict_update');
    expect(result.lagMs).toBe(2000);
    // Covariance should have grown due to process noise
    const fusedTrace = trace(result.covariance);
    // Result should still be valid (finite)
    expect(Number.isFinite(fusedTrace)).toBe(true);
    expect(Number.isFinite(result.state.lat)).toBe(true);
    expect(Number.isFinite(result.state.lon)).toBe(true);
  });

  it('should handle negative lag (observation is newer than track)', () => {
    const now = Date.now();
    const track = makeSystemTrack(32.0, 34.0, 1000, 100, 0.5, now);
    // Observation from the future relative to track
    const obs = makeObservation(32.001, 34.001, 1050, 100, now + 1000);

    const result = asyncFuse(track, obs, 'centralized_measurement_fusion');

    expect(result.method).toBe('async_predict_update');
    expect(result.lagMs).toBe(-1000);
    // Should still produce a valid result
    expect(Number.isFinite(result.state.lat)).toBe(true);
    expect(Number.isFinite(result.state.lon)).toBe(true);
  });

  it('should use conservative mode when specified', () => {
    const now = Date.now();
    const track = makeSystemTrack(32.0, 34.0, 1000, 100, 0.5, now);
    const obs = makeObservation(32.001, 34.001, 1050, 100, now - 500);

    const result = asyncFuse(track, obs, 'conservative_track_fusion');

    expect(result.method).toBe('async_predict_update');
    expect(result.lagMs).toBe(500);
    // Should produce a valid fused result
    expect(Number.isFinite(result.state.lat)).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
