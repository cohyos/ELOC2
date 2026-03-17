import { describe, it, expect } from 'vitest';
import type {
  BearingMeasurement,
  CueId,
  EoTrack,
  EoTrackId,
  SensorId,
  SystemTrackId,
  Timestamp,
} from '@eloc2/domain';
import {
  assessAmbiguity,
  updateHypotheses,
} from '../ambiguity/ambiguity-handler.js';
import type { GroupId, UnresolvedGroup } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let trackCounter = 0;

function makeEoTrack(overrides: Partial<EoTrack> = {}): EoTrack {
  trackCounter++;
  const now = Date.now() as Timestamp;
  return {
    eoTrackId: `eo-track-${trackCounter}` as EoTrackId,
    parentCueId: 'cue-1' as CueId,
    sensorId: 'eo-sensor-1' as SensorId,
    bearing: {
      azimuthDeg: 45 + trackCounter,
      elevationDeg: 10,
      timestamp: now,
      sensorId: 'eo-sensor-1' as SensorId,
    },
    imageQuality: 0.8,
    identificationSupport: undefined,
    status: 'tentative',
    lineage: [],
    associatedSystemTrackId: undefined,
    confidence: 0.5,
    lastUpdated: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ambiguity-handler', () => {
  it('should return "clear" for a single EO track', () => {
    const track = makeEoTrack();
    const result = assessAmbiguity([track], 'cue-1' as CueId);

    expect(result.type).toBe('clear');
    expect(result.eoTrackIds).toHaveLength(1);
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0].probability).toBe(1);
  });

  it('should return "clear" for no tracks', () => {
    const result = assessAmbiguity([], 'cue-1' as CueId);

    expect(result.type).toBe('clear');
    expect(result.eoTrackIds).toHaveLength(0);
    expect(result.hypotheses).toHaveLength(0);
  });

  it('should return "crowded" for two high-confidence tracks', () => {
    const track1 = makeEoTrack({ confidence: 0.9 });
    const track2 = makeEoTrack({ confidence: 0.85 });

    const result = assessAmbiguity([track1, track2], 'cue-1' as CueId);

    expect(result.type).toBe('crowded');
    expect(result.eoTrackIds).toHaveLength(2);
    expect(result.hypotheses).toHaveLength(2);
  });

  it('should return "unresolved" for two low-confidence tracks', () => {
    const track1 = makeEoTrack({ confidence: 0.3 });
    const track2 = makeEoTrack({ confidence: 0.4 });

    const result = assessAmbiguity([track1, track2], 'cue-1' as CueId);

    expect(result.type).toBe('unresolved');
    expect(result.eoTrackIds).toHaveLength(2);
    expect(result.hypotheses).toHaveLength(2);
  });

  it('should create hypotheses with equal probability', () => {
    const track1 = makeEoTrack({ confidence: 0.3 });
    const track2 = makeEoTrack({ confidence: 0.4 });
    const track3 = makeEoTrack({ confidence: 0.5 });

    const result = assessAmbiguity(
      [track1, track2, track3],
      'cue-1' as CueId,
    );

    const expectedProbability = 1 / 3;
    for (const h of result.hypotheses) {
      expect(h.probability).toBeCloseTo(expectedProbability, 10);
    }
  });

  it('should return "unresolved" when mix of high and low confidence tracks', () => {
    const track1 = makeEoTrack({ confidence: 0.9 });
    const track2 = makeEoTrack({ confidence: 0.3 });

    const result = assessAmbiguity([track1, track2], 'cue-1' as CueId);

    expect(result.type).toBe('unresolved');
  });

  it('should include evidence in hypotheses', () => {
    const track = makeEoTrack({ confidence: 0.75, status: 'confirmed' });
    const result = assessAmbiguity([track], 'cue-1' as CueId);

    expect(result.hypotheses[0].evidence).toContain('confidence=0.75');
    expect(result.hypotheses[0].evidence).toContain('status=confirmed');
  });

  it('should set equal initial probabilities for multiple tracks', () => {
    const tracks = [
      makeEoTrack({ confidence: 0.5 }),
      makeEoTrack({ confidence: 0.5 }),
      makeEoTrack({ confidence: 0.5 }),
    ];
    const result = assessAmbiguity(tracks, 'cue-1' as CueId);

    expect(result.initialProbabilities).toBeDefined();
    expect(result.initialProbabilities).toHaveLength(3);
    for (const p of result.initialProbabilities!) {
      expect(p).toBeCloseTo(1 / 3, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// Bayesian hypothesis update tests
// ---------------------------------------------------------------------------

function makeGroup(
  eoTrackIds: string[],
  overrides: Partial<UnresolvedGroup> = {},
): UnresolvedGroup {
  return {
    groupId: 'group-1' as GroupId,
    eoTrackIds: eoTrackIds as EoTrackId[],
    parentCueId: 'cue-1' as CueId,
    reason: 'ambiguous bearings',
    createdAt: Date.now() as Timestamp,
    status: 'active',
    resolutionEvent: undefined,
    ...overrides,
  };
}

describe('updateHypotheses — Bayesian update', () => {
  it('should shift probability toward the hypothesis closest to the new bearing', () => {
    // Track 1 at azimuth 45, Track 2 at azimuth 50
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 50,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    const group = makeGroup(['eo-t1', 'eo-t2'], {
      hypothesisProbabilities: [0.5, 0.5],
    });

    // New bearing close to track1 (azimuth 45.1)
    const newBearing = {
      azimuthDeg: 45.1,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    const result = updateHypotheses(group, newBearing, [track1, track2]);

    // Track1 should get higher probability
    const probs = result.group.hypothesisProbabilities!;
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(probs[0]).toBeGreaterThan(0.5);
    expect(probs[1]).toBeLessThan(0.5);
  });

  it('should converge when max probability exceeds threshold after updates', () => {
    // Track 1 at azimuth 45, Track 2 at azimuth 55 (far apart)
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 55,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    let group = makeGroup(['eo-t1', 'eo-t2'], {
      hypothesisProbabilities: [0.5, 0.5],
    });

    // Keep sending bearings near track1 — should converge
    const nearTrack1 = {
      azimuthDeg: 45.05,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    let converged = false;
    for (let i = 0; i < 10; i++) {
      const result = updateHypotheses(group, nearTrack1, [track1, track2]);
      group = result.group;
      if (result.converged) {
        converged = true;
        expect(result.winnerIndex).toBe(0);
        expect(result.group.status).toBe('resolved');
        break;
      }
    }

    expect(converged).toBe(true);
  });

  it('should NOT converge when probabilities are evenly spread', () => {
    // Both tracks at nearly the same azimuth — bearing equally matches both
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    const group = makeGroup(['eo-t1', 'eo-t2'], {
      hypothesisProbabilities: [0.5, 0.5],
    });

    // Bearing equally close to both
    const newBearing = {
      azimuthDeg: 45,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    const result = updateHypotheses(group, newBearing, [track1, track2]);

    expect(result.converged).toBe(false);
    // Probabilities should remain roughly equal
    const probs = result.group.hypothesisProbabilities!;
    expect(probs[0]).toBeCloseTo(0.5, 5);
    expect(probs[1]).toBeCloseTo(0.5, 5);
  });

  it('should escalate when updateCount >= 3 and not converged', () => {
    // Tracks at same position — will never converge
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    let group = makeGroup(['eo-t1', 'eo-t2'], {
      hypothesisProbabilities: [0.5, 0.5],
    });

    const bearing = {
      azimuthDeg: 45,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    // Perform 3 updates — should escalate on the 3rd
    let result;
    for (let i = 0; i < 3; i++) {
      result = updateHypotheses(group, bearing, [track1, track2]);
      group = result.group;
    }

    expect(result!.escalated).toBe(true);
    expect(result!.group.escalated).toBe(true);
    expect(result!.group.updateCount).toBe(3);
    expect(result!.converged).toBe(false);
  });

  it('should NOT escalate before 3 updates', () => {
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    const group = makeGroup(['eo-t1', 'eo-t2'], {
      hypothesisProbabilities: [0.5, 0.5],
    });

    const bearing = {
      azimuthDeg: 45,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    // Only 1 update
    const result = updateHypotheses(group, bearing, [track1, track2]);
    expect(result.escalated).toBe(false);
    expect(result.group.updateCount).toBe(1);
  });

  it('should initialize probabilities to equal if not set on group', () => {
    const track1 = makeEoTrack({
      eoTrackId: 'eo-t1' as EoTrackId,
      bearing: {
        azimuthDeg: 45,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });
    const track2 = makeEoTrack({
      eoTrackId: 'eo-t2' as EoTrackId,
      bearing: {
        azimuthDeg: 50,
        elevationDeg: 10,
        timestamp: Date.now() as Timestamp,
        sensorId: 'eo-sensor-1' as SensorId,
      },
    });

    // Group without hypothesisProbabilities
    const group = makeGroup(['eo-t1', 'eo-t2']);

    const newBearing = {
      azimuthDeg: 45.1,
      elevationDeg: 10,
      timestamp: Date.now() as Timestamp,
      sensorId: 'eo-sensor-1' as SensorId,
    };

    const result = updateHypotheses(group, newBearing, [track1, track2]);

    // Should still work — track1 closer to bearing
    expect(result.group.hypothesisProbabilities).toBeDefined();
    expect(result.group.hypothesisProbabilities![0]).toBeGreaterThan(0.5);
  });
});
