import { describe, it, expect } from 'vitest';
import type {
  SystemTrack,
  SensorState,
  SensorId,
  SystemTrackId,
  ScoreBreakdown,
  Timestamp,
} from '@eloc2/domain';
import { assignTasks } from '../assignment/assigner.js';
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
