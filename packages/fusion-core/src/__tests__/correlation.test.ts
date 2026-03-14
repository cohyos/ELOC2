import { describe, it, expect } from 'vitest';
import type {
  SourceObservation,
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { correlate } from '../correlation/correlator.js';

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
  id: string,
  lat: number,
  lon: number,
  alt = 1000,
  covDiag = 100,
  confidence = 0.5,
): SystemTrack {
  return {
    systemTrackId: id as SystemTrackId,
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

describe('correlate', () => {
  it('should return new_track when no existing tracks', () => {
    const obs = makeObservation(32.0, 34.0);
    const result = correlate(obs, []);

    expect(result.decision).toBe('new_track');
    expect(result.selectedTrackId).toBeUndefined();
    expect(result.candidates).toHaveLength(0);
  });

  it('should associate two observations close together with the same track', () => {
    // Track at (32.0, 34.0), observation very close by
    const track = makeSystemTrack('track-1', 32.0, 34.0);
    // Observation offset by ~10 meters (tiny lat offset)
    const obs = makeObservation(32.0001, 34.0001);

    const result = correlate(obs, [track]);

    expect(result.decision).toBe('associated');
    expect(result.selectedTrackId).toBe('track-1');
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('should return new_track for observation far from existing tracks', () => {
    // Track at (32.0, 34.0), observation very far away (~100km)
    const track = makeSystemTrack('track-1', 32.0, 34.0);
    const obs = makeObservation(33.0, 35.0);

    const result = correlate(obs, [track]);

    expect(result.decision).toBe('new_track');
    expect(result.selectedTrackId).toBeUndefined();
  });

  it('should pick nearest track when multiple tracks are within gate', () => {
    // Two tracks relatively close to the observation but at different distances
    // Using very large covariance so both pass the gate
    const track1 = makeSystemTrack('track-1', 32.001, 34.001, 1000, 1e8);
    const track2 = makeSystemTrack('track-2', 32.0005, 34.0005, 1000, 1e8);
    const obs = makeObservation(32.0, 34.0, 1000, 1e8);

    const result = correlate(obs, [track1, track2]);

    expect(result.decision).toBe('associated');
    expect(result.candidates.length).toBe(2);
    // track-2 is closer to the observation
    expect(result.selectedTrackId).toBe('track-2');
  });

  it('should skip dropped tracks', () => {
    const track = makeSystemTrack('track-1', 32.0, 34.0);
    track.status = 'dropped';
    const obs = makeObservation(32.0001, 34.0001);

    const result = correlate(obs, [track]);

    expect(result.decision).toBe('new_track');
  });

  it('should record all candidates within gate', () => {
    // Both tracks are very close; use large covariance
    const track1 = makeSystemTrack('track-1', 32.001, 34.0, 1000, 1e8);
    const track2 = makeSystemTrack('track-2', 32.002, 34.0, 1000, 1e8);
    const obs = makeObservation(32.0, 34.0, 1000, 1e8);

    const result = correlate(obs, [track1, track2]);

    expect(result.candidates.length).toBe(2);
    // candidates should be sorted by distance ascending
    expect(result.candidates[0].distance).toBeLessThanOrEqual(
      result.candidates[1].distance,
    );
  });
});
