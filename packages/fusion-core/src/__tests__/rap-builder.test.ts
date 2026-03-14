import { describe, it, expect } from 'vitest';
import type {
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { buildRapSnapshot } from '../rap-projection/rap-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(
  id: string,
  status: 'tentative' | 'confirmed' | 'dropped',
  confidence: number,
): SystemTrack {
  return {
    systemTrackId: id as SystemTrackId,
    state: { lat: 32.0, lon: 34.0, alt: 1000 },
    velocity: undefined,
    covariance: [
      [100, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
    ] as Covariance3x3,
    confidence,
    status,
    lineage: [],
    lastUpdated: Date.now() as Timestamp,
    sources: ['sensor-1' as SensorId],
    eoInvestigationStatus: 'none',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildRapSnapshot', () => {
  it('should exclude dropped tracks', () => {
    const tracks = [
      makeTrack('t1', 'confirmed', 0.9),
      makeTrack('t2', 'dropped', 0.1),
      makeTrack('t3', 'tentative', 0.5),
    ];

    const snapshot = buildRapSnapshot(tracks);

    expect(snapshot.trackCount).toBe(2);
    expect(snapshot.tracks.every((t) => t.status !== 'dropped')).toBe(true);
  });

  it('should sort tracks by confidence descending', () => {
    const tracks = [
      makeTrack('t1', 'confirmed', 0.3),
      makeTrack('t2', 'confirmed', 0.9),
      makeTrack('t3', 'tentative', 0.6),
    ];

    const snapshot = buildRapSnapshot(tracks);

    expect(snapshot.tracks[0].systemTrackId).toBe('t2');
    expect(snapshot.tracks[1].systemTrackId).toBe('t3');
    expect(snapshot.tracks[2].systemTrackId).toBe('t1');
  });

  it('should count confirmed and tentative tracks correctly', () => {
    const tracks = [
      makeTrack('t1', 'confirmed', 0.9),
      makeTrack('t2', 'confirmed', 0.8),
      makeTrack('t3', 'tentative', 0.5),
      makeTrack('t4', 'dropped', 0.1),
    ];

    const snapshot = buildRapSnapshot(tracks);

    expect(snapshot.confirmedCount).toBe(2);
    expect(snapshot.tentativeCount).toBe(1);
    expect(snapshot.trackCount).toBe(3);
  });

  it('should handle empty track list', () => {
    const snapshot = buildRapSnapshot([]);

    expect(snapshot.trackCount).toBe(0);
    expect(snapshot.confirmedCount).toBe(0);
    expect(snapshot.tentativeCount).toBe(0);
    expect(snapshot.tracks).toEqual([]);
  });

  it('should have a valid timestamp', () => {
    const before = Date.now();
    const snapshot = buildRapSnapshot([makeTrack('t1', 'confirmed', 0.9)]);
    const after = Date.now();

    expect(snapshot.timestamp).toBeGreaterThanOrEqual(before);
    expect(snapshot.timestamp).toBeLessThanOrEqual(after);
  });
});
