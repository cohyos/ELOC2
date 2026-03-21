import { describe, it, expect } from 'vitest';
import type {
  SystemTrack,
  SourceObservation,
  SystemTrackId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import {
  buildGatingMatrix,
  findClusters,
  DEFAULT_GATING_CONFIG,
} from '../association/gating-service.js';

// ---------------------------------------------------------------------------
// Helpers — minimal mock factories
// ---------------------------------------------------------------------------

// Large covariance (1 km² per axis) so the gate is generous for nearby pairs
const LARGE_COV: [[number, number, number], [number, number, number], [number, number, number]] = [
  [1e6, 0,   0  ],
  [0,   1e6, 0  ],
  [0,   0,   1e6],
];

function mockTrack(id: string, lat: number, lon: number, alt = 1000): SystemTrack {
  return {
    systemTrackId: id as SystemTrackId,
    state: { lat, lon, alt },
    velocity: { vx: 0, vy: 0, vz: 0 },
    covariance: LARGE_COV,
    confidence: 0.8,
    status: 'confirmed',
    lineage: [],
    lastUpdated: Date.now() as Timestamp,
    sources: ['sensor-1' as SensorId],
    eoInvestigationStatus: 'none',
  };
}

function mockObs(id: string, lat: number, lon: number, alt = 1000): SourceObservation {
  return {
    observationId: id,
    sensorId: 'sensor-1' as SensorId,
    timestamp: Date.now() as Timestamp,
    position: { lat, lon, alt },
    velocity: undefined,
    covariance: LARGE_COV,
    sensorFrame: 'radar',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildGatingMatrix', () => {
  it('returns empty entries for well-separated observations and tracks', () => {
    // Track near Tel Aviv, observation near London — ~3600 km apart
    const tracks = [mockTrack('track-1', 32.0, 34.8)];
    const observations = [mockObs('obs-1', 51.5, 0.1)];

    const matrix = buildGatingMatrix(observations, tracks, DEFAULT_GATING_CONFIG);

    expect(matrix.entries).toHaveLength(0);
    expect(matrix.observationCount).toBe(1);
    expect(matrix.trackCount).toBe(1);
  });

  it('returns an entry when observation is at the same location as track', () => {
    const lat = 32.0;
    const lon = 34.8;
    const tracks = [mockTrack('track-1', lat, lon)];
    const observations = [mockObs('obs-1', lat, lon)];

    const matrix = buildGatingMatrix(observations, tracks, DEFAULT_GATING_CONFIG);

    expect(matrix.entries.length).toBeGreaterThanOrEqual(1);
    expect(matrix.entries[0].observationIndex).toBe(0);
    expect(matrix.entries[0].trackIndex).toBe(0);
    expect(matrix.entries[0].mahalanobisDistSq).toBeGreaterThanOrEqual(0);
  });

  it('skips dropped tracks', () => {
    const lat = 32.0;
    const lon = 34.8;
    const track = mockTrack('track-1', lat, lon);
    (track as unknown as { status: string }).status = 'dropped';
    const observations = [mockObs('obs-1', lat, lon)];

    const matrix = buildGatingMatrix(observations, [track], DEFAULT_GATING_CONFIG);

    expect(matrix.entries).toHaveLength(0);
  });

  it('correctly populates trackIds and observationIds arrays', () => {
    const tracks = [mockTrack('track-1', 32.0, 34.8)];
    const observations = [mockObs('obs-1', 32.0, 34.8)];

    const matrix = buildGatingMatrix(observations, tracks);

    expect(matrix.trackIds[0]).toBe('track-1');
    expect(matrix.observationIds[0]).toBe('obs-1');
    expect(matrix.trackCount).toBe(1);
    expect(matrix.observationCount).toBe(1);
  });
});

describe('findClusters', () => {
  it('returns separate clusters for independent groups', () => {
    // Two tracks and observations far apart from each other
    const tracks = [
      mockTrack('track-1', 32.0, 34.0),
      mockTrack('track-2', 45.0, 10.0), // ~1500 km away
    ];
    const observations = [
      mockObs('obs-1', 32.0001, 34.0001), // very near track-1
      mockObs('obs-2', 45.0001, 10.0001), // very near track-2
    ];

    const matrix = buildGatingMatrix(observations, tracks, DEFAULT_GATING_CONFIG);
    const clusters = findClusters(matrix);

    // Two independent groups → two clusters
    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      expect(cluster.trackIndices).toHaveLength(1);
      expect(cluster.observationIndices).toHaveLength(1);
    }
  });

  it('groups connected observations and tracks into one cluster', () => {
    // Both observations map to the same track → single cluster
    const tracks = [mockTrack('track-1', 32.0, 34.0)];
    const observations = [
      mockObs('obs-1', 32.0, 34.0),
      mockObs('obs-2', 32.0001, 34.0001),
    ];

    const matrix = buildGatingMatrix(observations, tracks, DEFAULT_GATING_CONFIG);
    const clusters = findClusters(matrix);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].trackIndices).toContain(0);
    expect(clusters[0].observationIndices).toHaveLength(2);
  });

  it('returns no clusters when gating matrix has no entries', () => {
    const tracks = [mockTrack('track-1', 32.0, 34.8)];
    const observations = [mockObs('obs-1', 51.5, 0.1)]; // far away

    const matrix = buildGatingMatrix(observations, tracks, DEFAULT_GATING_CONFIG);
    const clusters = findClusters(matrix);

    expect(clusters).toHaveLength(0);
  });
});
