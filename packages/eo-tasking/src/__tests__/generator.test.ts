import { describe, it, expect } from 'vitest';
import type { SystemTrack, SensorState, SensorId, SystemTrackId, Timestamp } from '@eloc2/domain';
import { generateCandidates } from '../candidate-generation/generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<SystemTrack> = {}): SystemTrack {
  return {
    systemTrackId: 'track-1' as SystemTrackId,
    state: { lat: 32.0, lon: 34.0, alt: 5000 },
    velocity: { vx: 100, vy: 0, vz: 0 },
    covariance: [
      [100, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
    ],
    confidence: 0.8,
    status: 'confirmed',
    lineage: [],
    lastUpdated: Date.now() as Timestamp,
    sources: [],
    eoInvestigationStatus: 'none',
    ...overrides,
  };
}

function makeEoSensor(overrides: Partial<SensorState> = {}): SensorState {
  return {
    sensorId: 'eo-1' as SensorId,
    sensorType: 'eo',
    position: { lat: 31.5, lon: 34.0, alt: 0 },
    gimbal: {
      azimuthDeg: 0,
      elevationDeg: 10,
      slewRateDegPerSec: 30,
      currentTargetId: undefined,
    },
    fov: { halfAngleHDeg: 5, halfAngleVDeg: 3 },
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 85, maxRangeM: 100000 },
    online: true,
    lastUpdateTime: Date.now() as Timestamp,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateCandidates', () => {
  it('should generate candidates for un-investigated tracks with EO sensors', () => {
    const tracks = [makeTrack({ eoInvestigationStatus: 'none' })];
    const sensors = [makeEoSensor()];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.systemTrackId).toBe('track-1');
    expect(candidates[0]!.sensorId).toBe('eo-1');
  });

  it('should skip dropped tracks', () => {
    const tracks = [makeTrack({ status: 'dropped', eoInvestigationStatus: 'none' })];
    const sensors = [makeEoSensor()];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(0);
  });

  it('should skip tracks with eoInvestigationStatus === confirmed', () => {
    const tracks = [makeTrack({ eoInvestigationStatus: 'confirmed' })];
    const sensors = [makeEoSensor()];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(0);
  });

  it('should skip non-EO sensors (radars and c4isr)', () => {
    const tracks = [makeTrack({ eoInvestigationStatus: 'none' })];
    const sensors = [
      makeEoSensor({ sensorId: 'radar-1' as SensorId, sensorType: 'radar' }),
      makeEoSensor({ sensorId: 'c4isr-1' as SensorId, sensorType: 'c4isr' }),
    ];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(0);
  });

  it('should return empty array when tracks or sensors are empty', () => {
    expect(generateCandidates([], [makeEoSensor()])).toHaveLength(0);
    expect(generateCandidates([makeTrack()], [])).toHaveLength(0);
    expect(generateCandidates([], [])).toHaveLength(0);
  });

  it('should generate cross-product of eligible tracks and sensors', () => {
    const tracks = [
      makeTrack({ systemTrackId: 'track-1' as SystemTrackId, eoInvestigationStatus: 'none' }),
      makeTrack({ systemTrackId: 'track-2' as SystemTrackId, eoInvestigationStatus: 'pending' }),
    ];
    const sensors = [
      makeEoSensor({ sensorId: 'eo-1' as SensorId }),
      makeEoSensor({ sensorId: 'eo-2' as SensorId }),
    ];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(4); // 2 tracks x 2 sensors
  });

  it('should skip offline EO sensors', () => {
    const tracks = [makeTrack({ eoInvestigationStatus: 'none' })];
    const sensors = [makeEoSensor({ online: false })];

    const candidates = generateCandidates(tracks, sensors);

    expect(candidates).toHaveLength(0);
  });
});
