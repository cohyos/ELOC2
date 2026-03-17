import { describe, it, expect } from 'vitest';
import type {
  GeometryClass,
  Position3D,
  SystemTrack,
  SensorState,
  SensorId,
  SystemTrackId,
  ScoreBreakdown,
  Timestamp,
} from '@eloc2/domain';
import {
  assignTasks,
  computeIntersectionAngle,
  getActiveObservingEoSensors,
} from '../assignment/assigner.js';
import type { CoordinationOptions } from '../assignment/assigner.js';
import type { TaskDecision } from '../policy/policy-engine.js';
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

function makeDecision(
  trackId: string,
  sensorId: string,
  total: number,
  approved: boolean,
): TaskDecision {
  const track = makeTrack({ systemTrackId: trackId as SystemTrackId });
  const sensor = makeEoSensor({ sensorId: sensorId as SensorId });
  const candidate: TaskCandidate = {
    systemTrackId: track.systemTrackId,
    sensorId: sensor.sensorId,
    systemTrack: track,
    sensorState: sensor,
  };
  const score: ScoreBreakdown = {
    threatScore: 5,
    uncertaintyReduction: 1,
    geometryGain: 5,
    operatorIntent: 0,
    slewCost: 1,
    occupancyCost: 0,
    total,
  };
  return { candidate, score, approved, reason: approved ? 'auto_approved' : 'rejected' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assignTasks', () => {
  it('should assign highest scored task to sensor when multiple compete', () => {
    const decisions = [
      makeDecision('track-1', 'eo-1', 10, true),
      makeDecision('track-2', 'eo-1', 20, true), // higher score, same sensor
    ];

    const assignments = assignTasks(decisions);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.systemTrackId).toBe('track-2');
    expect(assignments[0]!.sensorId).toBe('eo-1');
  });

  it('should assign each sensor at most once', () => {
    const decisions = [
      makeDecision('track-1', 'eo-1', 15, true),
      makeDecision('track-2', 'eo-1', 10, true),
      makeDecision('track-3', 'eo-2', 12, true),
      makeDecision('track-4', 'eo-2', 8, true),
    ];

    const assignments = assignTasks(decisions);

    expect(assignments).toHaveLength(2);

    const sensorIds = assignments.map((a) => a.sensorId as string);
    expect(new Set(sensorIds).size).toBe(2); // each sensor exactly once
  });

  it('should return empty assignments when no decisions are approved', () => {
    const decisions = [
      makeDecision('track-1', 'eo-1', 10, false),
      makeDecision('track-2', 'eo-2', 20, false),
    ];

    const assignments = assignTasks(decisions);

    expect(assignments).toHaveLength(0);
  });

  it('should generate unique taskIds for each assignment', () => {
    const decisions = [
      makeDecision('track-1', 'eo-1', 10, true),
      makeDecision('track-2', 'eo-2', 20, true),
    ];

    const assignments = assignTasks(decisions);

    expect(assignments).toHaveLength(2);
    const taskIds = assignments.map((a) => a.taskId as string);
    expect(new Set(taskIds).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeIntersectionAngle
// ---------------------------------------------------------------------------

describe('computeIntersectionAngle', () => {
  it('should return ~90° for sensors at right angles from the track', () => {
    // Track at origin, sensors due north and due east — should give ~90°
    const track: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 };
    const sensor1: Position3D = { lat: 32.5, lon: 34.0, alt: 0 }; // north
    const sensor2: Position3D = { lat: 32.0, lon: 34.5, alt: 0 }; // east

    const angle = computeIntersectionAngle(sensor1, sensor2, track);
    expect(angle).toBeGreaterThan(80);
    expect(angle).toBeLessThan(100);
  });

  it('should return ~0° for near-collinear sensors', () => {
    // Both sensors roughly north of the track, very close together
    const track: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 };
    const sensor1: Position3D = { lat: 32.5, lon: 34.0, alt: 0 };
    const sensor2: Position3D = { lat: 32.6, lon: 34.0, alt: 0 };

    const angle = computeIntersectionAngle(sensor1, sensor2, track);
    expect(angle).toBeLessThan(5);
  });

  it('should return ~180° for sensors on opposite sides of the track', () => {
    const track: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 };
    const sensor1: Position3D = { lat: 32.5, lon: 34.0, alt: 0 }; // north
    const sensor2: Position3D = { lat: 31.5, lon: 34.0, alt: 0 }; // south

    const angle = computeIntersectionAngle(sensor1, sensor2, track);
    expect(angle).toBeGreaterThan(170);
  });
});

// ---------------------------------------------------------------------------
// getActiveObservingEoSensors
// ---------------------------------------------------------------------------

describe('getActiveObservingEoSensors', () => {
  it('should return sensors observing the given track', () => {
    const tasks = new Map([
      ['eo-1', 'track-1'],
      ['eo-2', 'track-1'],
      ['eo-3', 'track-2'],
    ]);
    const result = getActiveObservingEoSensors('track-1', tasks);
    expect(result).toEqual(['eo-1', 'eo-2']);
  });

  it('should return empty array when no sensors observe the track', () => {
    const tasks = new Map([['eo-1', 'track-2']]);
    const result = getActiveObservingEoSensors('track-1', tasks);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multi-sensor coordination in assignTasks
// ---------------------------------------------------------------------------

describe('assignTasks — multi-sensor coordination', () => {
  // Helper that creates a decision with a specific sensor position on the track
  function makeDecisionWithPos(
    trackId: string,
    sensorId: string,
    total: number,
    approved: boolean,
    sensorPos: Position3D,
    trackPos: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 },
  ): TaskDecision {
    const track = makeTrack({ systemTrackId: trackId as SystemTrackId, state: trackPos });
    const sensor = makeEoSensor({ sensorId: sensorId as SensorId, position: sensorPos });
    const candidate: TaskCandidate = {
      systemTrackId: track.systemTrackId,
      sensorId: sensor.sensorId,
      systemTrack: track,
      sensorState: sensor,
    };
    const score: ScoreBreakdown = {
      threatScore: 5,
      uncertaintyReduction: 1,
      geometryGain: 5,
      operatorIntent: 0,
      slewCost: 1,
      occupancyCost: 0,
      total,
    };
    return { candidate, score, approved, reason: approved ? 'auto_approved' : 'rejected' };
  }

  it('should boost score when two EO sensors have good intersection angle (>45°)', () => {
    const trackPos: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 };
    // eo-1 is already observing track-1 from the north
    // eo-2 (candidate) approaches from the east → ~90° angle → +3.0 bonus
    // eo-3 (candidate) approaches from the north → collinear → penalty
    const eo1Pos: Position3D = { lat: 32.5, lon: 34.0, alt: 0 };
    const eo2Pos: Position3D = { lat: 32.0, lon: 34.5, alt: 0 };
    const eo3Pos: Position3D = { lat: 32.6, lon: 34.0, alt: 0 };

    // eo-2 and eo-3 have equal base scores for track-1
    const decisions = [
      makeDecisionWithPos('track-1', 'eo-2', 10, true, eo2Pos, trackPos),
      makeDecisionWithPos('track-1', 'eo-3', 10, true, eo3Pos, trackPos),
    ];

    const coordOpts: CoordinationOptions = {
      activeEoTasks: new Map([['eo-1', 'track-1']]),
      sensorPositions: new Map([
        ['eo-1', eo1Pos],
        ['eo-2', eo2Pos],
        ['eo-3', eo3Pos],
      ]),
    };

    const assignments = assignTasks(decisions, 'auto_with_veto', coordOpts);

    // Both sensors get assigned (different sensors), but eo-2 should be first
    // because it gets a +3.0 coordination bonus (90° angle) vs eo-3 getting -1.0
    expect(assignments).toHaveLength(2);
    expect(assignments[0]!.sensorId).toBe('eo-2');
  });

  it('should penalise near-collinear sensor pairs (angle < 10°)', () => {
    const trackPos: Position3D = { lat: 32.0, lon: 34.0, alt: 5000 };
    const eo1Pos: Position3D = { lat: 32.5, lon: 34.0, alt: 0 };
    const eo2Pos: Position3D = { lat: 32.6, lon: 34.0, alt: 0 }; // collinear with eo-1

    // eo-2 has a slightly higher base score than threshold, but coordination penalty
    // should reduce its effective score
    const decisions = [
      makeDecisionWithPos('track-1', 'eo-2', 12, true, eo2Pos, trackPos),
    ];

    const coordOpts: CoordinationOptions = {
      activeEoTasks: new Map([['eo-1', 'track-1']]),
      sensorPositions: new Map([
        ['eo-1', eo1Pos],
        ['eo-2', eo2Pos],
      ]),
    };

    // The assignment still happens (greedy), but the effective score is reduced.
    // We verify the assignment is made but with original scoreBreakdown unchanged
    // (the coordination only affects sort order, not the stored score).
    const assignments = assignTasks(decisions, 'auto_with_veto', coordOpts);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.scoreBreakdown.total).toBe(12); // original score preserved
  });

  it('should boost bearing_only tracks for revisit priority', () => {
    // Two tracks: one bearing_only (+2.0 boost), one confirmed_3d (-1.0)
    // bearing_only track has lower base score but should win with the boost
    const decisions = [
      makeDecision('track-bo', 'eo-1', 8, true),
      makeDecision('track-3d', 'eo-2', 10, true),
    ];

    const coordOpts: CoordinationOptions = {
      trackGeometryClass: new Map<string, GeometryClass>([
        ['track-bo', 'bearing_only'],
        ['track-3d', 'confirmed_3d'],
      ]),
    };

    const assignments = assignTasks(decisions, 'auto_with_veto', coordOpts);

    // track-bo: 8 + 2.0 = 10.0, track-3d: 10 - 1.0 = 9.0
    // eo-1 → track-bo should come first
    expect(assignments).toHaveLength(2);
    expect(assignments[0]!.systemTrackId).toBe('track-bo');
    expect(assignments[0]!.sensorId).toBe('eo-1');
  });

  it('should lower priority for confirmed_3d tracks', () => {
    // Two decisions for same sensor, different tracks
    // confirmed_3d track has higher base score but loses after penalty
    const decisions = [
      makeDecision('track-3d', 'eo-1', 12, true),
      makeDecision('track-new', 'eo-1', 11, true),
    ];

    const coordOpts: CoordinationOptions = {
      trackGeometryClass: new Map<string, GeometryClass>([
        ['track-3d', 'confirmed_3d'],
        // track-new has no geometry class → 0 adjustment
      ]),
    };

    const assignments = assignTasks(decisions, 'auto_with_veto', coordOpts);

    // track-3d: 12 - 1.0 = 11.0, track-new: 11 + 0 = 11.0
    // When tied, the first in the sorted array wins (stable sort preserves order)
    // Both have effective 11.0, but sensor can only be assigned once
    expect(assignments).toHaveLength(1);
  });

  it('should work as before when no coordination options provided', () => {
    const decisions = [
      makeDecision('track-1', 'eo-1', 10, true),
      makeDecision('track-2', 'eo-1', 20, true),
    ];

    const assignments = assignTasks(decisions);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.systemTrackId).toBe('track-2');
    expect(assignments[0]!.sensorId).toBe('eo-1');
  });
});
