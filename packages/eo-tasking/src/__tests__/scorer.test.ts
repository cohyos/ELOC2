import { describe, it, expect } from 'vitest';
import type { SystemTrack, SensorState, SensorId, SystemTrackId, Timestamp } from '@eloc2/domain';
import { scoreCandidate, DEFAULT_WEIGHTS } from '../scoring/scorer.js';
import type { TaskCandidate } from '../candidate-generation/generator.js';

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

function makeCandidate(
  trackOverrides: Partial<SystemTrack> = {},
  sensorOverrides: Partial<SensorState> = {},
): TaskCandidate {
  const track = makeTrack(trackOverrides);
  const sensor = makeEoSensor(sensorOverrides);
  return {
    systemTrackId: track.systemTrackId,
    sensorId: sensor.sensorId,
    systemTrack: track,
    sensorState: sensor,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('should produce higher threat score for tracks with higher confidence', () => {
    const highConfidence = makeCandidate({ confidence: 0.9 });
    const lowConfidence = makeCandidate({ confidence: 0.2 });

    const highScore = scoreCandidate(highConfidence);
    const lowScore = scoreCandidate(lowConfidence);

    expect(highScore.threatScore).toBeGreaterThan(lowScore.threatScore);
  });

  it('should boost total score when track is in operator high-interest set', () => {
    const candidate = makeCandidate();
    const highInterest = new Set<string>([candidate.systemTrackId as string]);

    const withInterest = scoreCandidate(candidate, DEFAULT_WEIGHTS, highInterest);
    const withoutInterest = scoreCandidate(candidate, DEFAULT_WEIGHTS, new Set());

    expect(withInterest.operatorIntent).toBe(3.0);
    expect(withoutInterest.operatorIntent).toBe(0);
    expect(withInterest.total).toBeGreaterThan(withoutInterest.total);
  });

  it('should reduce total score with slew cost when gimbal is far from target', () => {
    // Sensor pointing north (0 deg), target roughly east requires large slew
    const candidate = makeCandidate(
      { state: { lat: 31.5, lon: 35.0, alt: 5000 } },
      {
        gimbal: {
          azimuthDeg: 0,
          elevationDeg: 10,
          slewRateDegPerSec: 30,
          currentTargetId: undefined,
        },
      },
    );

    const score = scoreCandidate(candidate);

    // Slew cost should be > 0 because target bearing is not 0
    expect(score.slewCost).toBeGreaterThan(0);
  });

  it('should increase occupancy cost when sensor is occupied', () => {
    const candidate = makeCandidate();
    const occupied = new Map<string, number>([[candidate.sensorId as string, 2]]);

    const occupiedScore = scoreCandidate(candidate, DEFAULT_WEIGHTS, new Set(), occupied);
    const freeScore = scoreCandidate(candidate, DEFAULT_WEIGHTS, new Set(), new Map());

    expect(occupiedScore.occupancyCost).toBeGreaterThan(freeScore.occupancyCost);
    expect(occupiedScore.total).toBeLessThan(freeScore.total);
  });

  it('should produce reasonable scores with default weights', () => {
    const candidate = makeCandidate();
    const score = scoreCandidate(candidate);

    // Total should be a finite number
    expect(Number.isFinite(score.total)).toBe(true);
    // Threat score should be positive for a track with confidence > 0
    expect(score.threatScore).toBeGreaterThan(0);
    // Geometry gain placeholder should be 5.0
    expect(score.geometryGain).toBe(5.0);
  });

  it('should produce higher threat score for lower altitude targets', () => {
    const lowAlt = makeCandidate({ state: { lat: 32.0, lon: 34.0, alt: 500 } });
    const highAlt = makeCandidate({ state: { lat: 32.0, lon: 34.0, alt: 14000 } });

    const lowAltScore = scoreCandidate(lowAlt);
    const highAltScore = scoreCandidate(highAlt);

    expect(lowAltScore.threatScore).toBeGreaterThan(highAltScore.threatScore);
  });
});
