import { describe, it, expect } from 'vitest';
import type {
  SystemTrack,
  SensorState,
  SensorId,
  SystemTrackId,
  ScoreBreakdown,
  Timestamp,
} from '@eloc2/domain';
import { applyPolicy } from '../policy/policy-engine.js';
import type { OperatorOverride } from '../policy/policy-engine.js';
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

function makeScore(total: number = 10): ScoreBreakdown {
  return {
    threatScore: 5,
    uncertaintyReduction: 1,
    geometryGain: 5,
    operatorIntent: 0,
    slewCost: 1,
    occupancyCost: 0,
    total,
  };
}

function makeScoredTask(
  trackId: string = 'track-1',
  sensorId: string = 'eo-1',
  total: number = 10,
) {
  const track = makeTrack({ systemTrackId: trackId as SystemTrackId });
  const sensor = makeEoSensor({ sensorId: sensorId as SensorId });
  const candidate: TaskCandidate = {
    systemTrackId: track.systemTrackId,
    sensorId: sensor.sensorId,
    systemTrack: track,
    sensorState: sensor,
  };
  return { candidate, score: makeScore(total) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyPolicy', () => {
  it('should set all decisions to unapproved in recommended_only mode', () => {
    const scored = [makeScoredTask('track-1', 'eo-1'), makeScoredTask('track-2', 'eo-2')];

    const decisions = applyPolicy(scored, 'recommended_only', []);

    expect(decisions).toHaveLength(2);
    for (const d of decisions) {
      expect(d.approved).toBe(false);
      expect(d.reason).toBe('recommended_only');
    }
  });

  it('should approve all in auto_with_veto unless explicitly rejected', () => {
    const scored = [makeScoredTask('track-1', 'eo-1'), makeScoredTask('track-2', 'eo-2')];

    const decisions = applyPolicy(scored, 'auto_with_veto', []);

    expect(decisions).toHaveLength(2);
    for (const d of decisions) {
      expect(d.approved).toBe(true);
      expect(d.reason).toBe('auto_approved');
    }
  });

  it('should only approve explicitly approved tasks in manual mode', () => {
    const scored = [makeScoredTask('track-1', 'eo-1'), makeScoredTask('track-2', 'eo-2')];

    const approvals: OperatorOverride[] = [
      {
        type: 'approve',
        taskId: 'track-1::eo-1' as any,
        timestamp: Date.now() as Timestamp,
        operatorId: 'op-1',
      },
    ];

    const decisions = applyPolicy(scored, 'manual', approvals);

    expect(decisions).toHaveLength(2);
    const approved = decisions.filter((d) => d.approved);
    const unapproved = decisions.filter((d) => !d.approved);

    expect(approved).toHaveLength(1);
    expect(approved[0]!.reason).toBe('operator_approved');
    expect(unapproved).toHaveLength(1);
    expect(unapproved[0]!.reason).toBe('awaiting_approval');
  });

  it('should reject tasks in auto_with_veto when operator explicitly rejects', () => {
    const scored = [makeScoredTask('track-1', 'eo-1'), makeScoredTask('track-2', 'eo-2')];

    const rejections: OperatorOverride[] = [
      {
        type: 'reject',
        taskId: 'track-1::eo-1' as any,
        timestamp: Date.now() as Timestamp,
        operatorId: 'op-1',
      },
    ];

    const decisions = applyPolicy(scored, 'auto_with_veto', rejections);

    expect(decisions).toHaveLength(2);
    const rejected = decisions.find(
      (d) => (d.candidate.systemTrackId as string) === 'track-1',
    );
    const approved = decisions.find(
      (d) => (d.candidate.systemTrackId as string) === 'track-2',
    );

    expect(rejected!.approved).toBe(false);
    expect(rejected!.reason).toBe('operator_rejected');
    expect(approved!.approved).toBe(true);
    expect(approved!.reason).toBe('auto_approved');
  });

  it('should handle empty scored tasks array', () => {
    const decisions = applyPolicy([], 'auto_with_veto', []);
    expect(decisions).toHaveLength(0);
  });
});
