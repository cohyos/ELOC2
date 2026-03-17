import { describe, it, expect } from 'vitest';
import type { SystemTrack, SensorState, SensorId, SystemTrackId, Timestamp } from '@eloc2/domain';
import { scoreCandidate, DEFAULT_WEIGHTS, computeIntersectionPotential } from '../scoring/scorer.js';
import type { ScoringWeights, ActiveBearing } from '../scoring/scorer.js';
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
    // Without activeBearings, intersection potential defaults to 1.0,
    // and with timeSinceLastObservation=0, revisitFactor=1 → geometryGain=5.0
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

// ---------------------------------------------------------------------------
// Dynamic geometry gain tests
// ---------------------------------------------------------------------------

describe('dynamic geometry gain', () => {
  it('should give near-zero geometry gain when bearings are parallel (0°)', () => {
    const candidate = makeCandidate();
    // The candidate sensor is due south of the track (bearing ~0° from sensor to track).
    // Create an active bearing that is also ~0° (parallel).
    const predictedBearing = 0; // roughly north from sensor to track
    const activeBearings: ActiveBearing[] = [
      { sensorId: 'eo-2', azimuthDeg: predictedBearing },
    ];

    const score = scoreCandidate(
      candidate, DEFAULT_WEIGHTS, new Set(), new Map(), activeBearings,
    );

    // Parallel bearings: sin(0°) ≈ 0, so geometry gain should be near 0
    expect(score.geometryGain).toBeLessThan(1.0);
  });

  it('should give maximum geometry gain when bearings are perpendicular (90°)', () => {
    const candidate = makeCandidate();
    // Candidate sensor → track bearing is roughly north (~0°).
    // Active bearing at 90° is perpendicular.
    const activeBearings: ActiveBearing[] = [
      { sensorId: 'eo-2', azimuthDeg: 90 },
    ];

    const score = scoreCandidate(
      candidate, DEFAULT_WEIGHTS, new Set(), new Map(), activeBearings,
    );

    // sin(~90°) ≈ 1.0, so geometry gain ≈ 5.0 (with revisitFactor=1)
    expect(score.geometryGain).toBeGreaterThan(4.0);
  });

  it('should return intersection potential 1.0 when no active bearings', () => {
    const candidate = makeCandidate();
    const potential = computeIntersectionPotential(candidate, []);
    expect(potential).toBe(1.0);
  });

  it('should increase geometry gain with revisit factor for stale tracks', () => {
    const candidate = makeCandidate();

    const fresh = scoreCandidate(
      candidate, DEFAULT_WEIGHTS, new Set(), new Map(), undefined, 0,
    );
    const stale = scoreCandidate(
      candidate, DEFAULT_WEIGHTS, new Set(), new Map(), undefined, 120,
    );

    // Stale: revisitFactor = 1 + 120/60 = 3, so geometryGain = 5*1*3 = 15
    // Fresh: revisitFactor = 1 + 0/60 = 1, so geometryGain = 5*1*1 = 5
    expect(stale.geometryGain).toBe(15.0);
    expect(fresh.geometryGain).toBe(5.0);
    expect(stale.geometryGain).toBeGreaterThan(fresh.geometryGain);
  });
});

// ---------------------------------------------------------------------------
// Closure rate bonus tests
// ---------------------------------------------------------------------------

describe('closure rate bonus', () => {
  it('should increase threat for approaching targets', () => {
    // Track moving toward sensor (sensor is south at lat=31.5, track at lat=32.0)
    // Negative vx means moving south (toward sensor in lat)
    const approaching = makeCandidate({ velocity: { vx: -200, vy: 0, vz: 0 } });
    const receding = makeCandidate({ velocity: { vx: 200, vy: 0, vz: 0 } });

    const approachingScore = scoreCandidate(approaching);
    const recedingScore = scoreCandidate(receding);

    // Approaching should have higher threat due to closure rate bonus
    expect(approachingScore.threatScore).toBeGreaterThan(recedingScore.threatScore);
  });

  it('should not add closure rate bonus for stationary targets', () => {
    const stationary = makeCandidate({ velocity: { vx: 0, vy: 0, vz: 0 } });
    const noVelocity = makeCandidate({ velocity: undefined });

    const stationaryScore = scoreCandidate(stationary);
    const noVelScore = scoreCandidate(noVelocity);

    // Both should have zero speed bonus and zero closure rate
    // The base threat (confidence * (1 + altPenalty)) should be the same
    // stationaryScore has speedBonus=0, closureRateBonus=0
    // noVelScore has speedBonus=0, closureRateBonus=0
    expect(stationaryScore.threatScore).toBeCloseTo(noVelScore.threatScore, 5);
  });
});

// ---------------------------------------------------------------------------
// Custom weights tests
// ---------------------------------------------------------------------------

describe('custom weights', () => {
  it('should override defaults correctly', () => {
    const candidate = makeCandidate();
    const customWeights: ScoringWeights = {
      threat: 0,
      uncertaintyReduction: 0,
      geometryGain: 0,
      operatorIntent: 0,
      slewCost: 0,
      occupancyCost: 0,
    };

    const score = scoreCandidate(candidate, customWeights);

    // All weights are zero so total should be zero
    expect(score.total).toBe(0);
  });

  it('should amplify geometry gain when its weight is increased', () => {
    const candidate = makeCandidate();
    const highGeoWeights: ScoringWeights = {
      ...DEFAULT_WEIGHTS,
      geometryGain: 5.0,
    };

    const defaultScore = scoreCandidate(candidate);
    const highGeoScore = scoreCandidate(candidate, highGeoWeights);

    // The geometry contribution should be larger
    expect(highGeoScore.total).toBeGreaterThan(defaultScore.total);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility tests
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('should produce same results when called without new params', () => {
    const candidate = makeCandidate();

    const score = scoreCandidate(candidate);

    // Without activeBearings and timeSinceLastObservation, geometry gain = 5.0
    expect(score.geometryGain).toBe(5.0);
    expect(Number.isFinite(score.total)).toBe(true);
    expect(score.threatScore).toBeGreaterThan(0);
  });

  it('should accept old-style call with only 4 positional params', () => {
    const candidate = makeCandidate();
    const score = scoreCandidate(
      candidate,
      DEFAULT_WEIGHTS,
      new Set<string>(),
      new Map<string, number>(),
    );

    expect(score.geometryGain).toBe(5.0);
    expect(Number.isFinite(score.total)).toBe(true);
  });
});
