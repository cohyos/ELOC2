import { describe, it, expect } from 'vitest';
import type {
  Covariance3x3,
  SensorId,
  SensorState,
  SystemTrack,
  SystemTrackId,
  Timestamp,
} from '@eloc2/domain';
import { issueCue, isCueValid, predictState } from '../cue-handling/cue-issuer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<SystemTrack> = {}): SystemTrack {
  return {
    systemTrackId: 'track-1' as SystemTrackId,
    state: { lat: 32.0, lon: 34.8, alt: 5000 },
    velocity: { vx: 100, vy: 50, vz: 0 }, // ~100 m/s east, ~50 m/s north
    covariance: [
      [400, 0, 0],
      [0, 400, 0],
      [0, 0, 100],
    ] as Covariance3x3,
    confidence: 0.7,
    status: 'confirmed',
    lineage: [],
    lastUpdated: (Date.now() - 5000) as Timestamp, // 5 seconds ago
    sources: ['radar-1' as SensorId],
    eoInvestigationStatus: 'none',
    ...overrides,
  };
}

function makeSensor(overrides: Partial<SensorState> = {}): SensorState {
  return {
    sensorId: 'eo-1' as SensorId,
    sensorType: 'eo',
    position: { lat: 31.9, lon: 34.7, alt: 50 },
    gimbal: {
      azimuthDeg: 0,
      elevationDeg: 10,
      slewRateDegPerSec: 30,
      currentTargetId: undefined,
    },
    fov: { halfAngleHDeg: 2, halfAngleVDeg: 1.5 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: -5,
      maxElDeg: 85,
      maxRangeM: 50000,
    },
    online: true,
    lastUpdateTime: Date.now() as Timestamp,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cue-issuer', () => {
  describe('issueCue', () => {
    it('should issue a valid cue from a system track', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      expect(cue.cueId).toBeDefined();
      expect(cue.systemTrackId).toBe(track.systemTrackId);
      expect(cue.predictedState).toBeDefined();
      expect(cue.predictedState.lat).toBeTypeOf('number');
      expect(cue.predictedState.lon).toBeTypeOf('number');
      expect(cue.predictedState.alt).toBeTypeOf('number');
      expect(cue.covariance).toHaveLength(3);
      expect(cue.expectedTargetCount).toBe(1);
      expect(cue.suggestedDwellMs).toBe(5000);
      expect(cue.registrationHealth).toBe('good');
    });

    it('should produce a validity window of 30 seconds', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      const windowMs = cue.validTo - cue.validFrom;
      expect(windowMs).toBe(30_000);
    });

    it('should assign higher priority to higher-confidence tracks', () => {
      const sensor = makeSensor();

      const lowConfTrack = makeTrack({ confidence: 0.2 });
      const highConfTrack = makeTrack({ confidence: 0.9 });

      const lowCue = issueCue(lowConfTrack, sensor);
      const highCue = issueCue(highConfTrack, sensor);

      expect(highCue.priority).toBeGreaterThan(lowCue.priority);
    });

    it('should use the supplied registrationHealth', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor, 'degraded');

      expect(cue.registrationHealth).toBe('degraded');
    });

    it('should compute a positive uncertainty gate', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      expect(cue.uncertaintyGateDeg).toBeGreaterThan(0);
      // Should be reasonable — not larger than 90 degrees for a km-range target
      expect(cue.uncertaintyGateDeg).toBeLessThan(10);
    });
  });

  describe('predictState', () => {
    it('should extrapolate position using constant velocity', () => {
      const now = Date.now() as Timestamp;
      const track = makeTrack({
        state: { lat: 32.0, lon: 34.0, alt: 1000 },
        velocity: { vx: 0, vy: 111.32, vz: 0 }, // ~111.32 m/s north = ~0.001 deg/s
        lastUpdated: (now - 10_000) as Timestamp, // 10 seconds ago
      });

      const predicted = predictState(track, now);

      // After 10 seconds at 111.32 m/s north, lat should increase by ~0.01 deg
      expect(predicted.position.lat).toBeCloseTo(32.01, 2);
      expect(predicted.position.lon).toBeCloseTo(34.0, 4);
    });

    it('should grow covariance over time', () => {
      const now = Date.now() as Timestamp;
      const track = makeTrack({
        lastUpdated: (now - 10_000) as Timestamp,
      });

      const predicted = predictState(track, now);

      // Diagonal elements should have grown
      expect(predicted.covariance[0][0]).toBeGreaterThan(track.covariance[0][0]);
      expect(predicted.covariance[1][1]).toBeGreaterThan(track.covariance[1][1]);
      // Off-diagonal elements should remain the same (only diagonal gets Q)
      expect(predicted.covariance[0][1]).toBe(track.covariance[0][1]);
    });

    it('should not move position when velocity is zero', () => {
      const now = Date.now() as Timestamp;
      const track = makeTrack({
        state: { lat: 32.0, lon: 34.0, alt: 1000 },
        velocity: { vx: 0, vy: 0, vz: 0 },
        lastUpdated: (now - 5_000) as Timestamp,
      });

      const predicted = predictState(track, now);

      expect(predicted.position.lat).toBeCloseTo(32.0, 6);
      expect(predicted.position.lon).toBeCloseTo(34.0, 6);
      expect(predicted.position.alt).toBeCloseTo(1000, 6);
    });
  });

  describe('isCueValid', () => {
    it('should return true when currentTime is within the validity window', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      const midpoint = ((cue.validFrom + cue.validTo) / 2) as Timestamp;
      expect(isCueValid(cue, midpoint)).toBe(true);
    });

    it('should return false when currentTime is after validTo', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      const afterExpiry = (cue.validTo + 1000) as Timestamp;
      expect(isCueValid(cue, afterExpiry)).toBe(false);
    });

    it('should return false when currentTime is before validFrom', () => {
      const track = makeTrack();
      const sensor = makeSensor();
      const cue = issueCue(track, sensor);

      const beforeStart = (cue.validFrom - 1000) as Timestamp;
      expect(isCueValid(cue, beforeStart)).toBe(false);
    });
  });
});
