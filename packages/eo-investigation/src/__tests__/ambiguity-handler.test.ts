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
import { assessAmbiguity } from '../ambiguity/ambiguity-handler.js';

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
});
