import { describe, it, expect } from 'vitest';
import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { conservativeFuse } from '../fusion/conservative-fuser.js';

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
    sensorFrame: 'eo',
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

describe('conservativeFuse', () => {
  it('should produce a fused state between track and observation', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 100);
    const obs = makeObservation(32.001, 34.001, 1050, 100);

    const result = conservativeFuse(track, obs);

    expect(result.method).toBe('covariance_intersection');
    // Fused position should be between track and observation
    expect(result.state.lat).toBeGreaterThanOrEqual(32.0);
    expect(result.state.lat).toBeLessThanOrEqual(32.001);
    expect(result.state.lon).toBeGreaterThanOrEqual(34.0);
    expect(result.state.lon).toBeLessThanOrEqual(34.001);
  });

  it('should have fused covariance trace <= min(input traces) (CI property)', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 200);
    const obs = makeObservation(32.001, 34.001, 1050, 300);

    const result = conservativeFuse(track, obs);

    const fusedTrace = trace(result.covariance);
    const trackTrace = trace(track.covariance);
    const obsTrace = trace(obs.covariance);
    const minInputTrace = Math.min(trackTrace, obsTrace);

    // CI guarantees: fused trace should not exceed the smaller input trace
    expect(fusedTrace).toBeLessThanOrEqual(minInputTrace + 1e-6);
  });

  it('should return result near midpoint for symmetric (equal) covariances', () => {
    const track = makeSystemTrack(32.0, 34.0, 1000, 100);
    const obs = makeObservation(32.002, 34.002, 1000, 100);

    const result = conservativeFuse(track, obs);

    // With equal covariances, the optimal omega is ~0.5, so fused
    // state should be approximately at the midpoint.
    const midLat = (32.0 + 32.002) / 2;
    const midLon = (34.0 + 34.002) / 2;

    expect(result.state.lat).toBeCloseTo(midLat, 2);
    expect(result.state.lon).toBeCloseTo(midLon, 2);
  });
});
