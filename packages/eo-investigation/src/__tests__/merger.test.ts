import { describe, it, expect } from 'vitest';
import type {
  BearingMeasurement,
  CueId,
  EoTrack,
  EoTrackId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import { mergeIntoGroup } from '../split-merge/merger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0;

function makeEoTrack(overrides: Partial<EoTrack> = {}): EoTrack {
  counter++;
  const now = Date.now() as Timestamp;
  return {
    eoTrackId: `eo-track-${counter}` as EoTrackId,
    parentCueId: 'cue-1' as CueId,
    sensorId: 'eo-sensor-1' as SensorId,
    bearing: {
      azimuthDeg: 45,
      elevationDeg: 10,
      timestamp: now,
      sensorId: 'eo-sensor-1' as SensorId,
    },
    imageQuality: 0.7,
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

describe('merger', () => {
  it('should merge two tracks into a group', () => {
    const track1 = makeEoTrack();
    const track2 = makeEoTrack();

    const result = mergeIntoGroup(
      [track1, track2],
      'Ambiguous bearings',
      'cue-1' as CueId,
    );

    expect(result.mergedGroup.eoTrackIds).toHaveLength(2);
    expect(result.mergedGroup.status).toBe('active');
    expect(result.mergedGroup.reason).toBe('Ambiguous bearings');
    expect(result.mergedGroup.groupId).toBeDefined();
    expect(result.mergedGroup.parentCueId).toBe('cue-1');
  });

  it('should set all track statuses to "unresolved"', () => {
    const track1 = makeEoTrack({ status: 'tentative' });
    const track2 = makeEoTrack({ status: 'confirmed' });

    const result = mergeIntoGroup(
      [track1, track2],
      'Cannot distinguish',
      'cue-1' as CueId,
    );

    for (const track of result.mergedTracks) {
      expect(track.status).toBe('unresolved');
    }
  });

  it('should include all track IDs in the group', () => {
    const track1 = makeEoTrack();
    const track2 = makeEoTrack();
    const track3 = makeEoTrack();

    const result = mergeIntoGroup(
      [track1, track2, track3],
      'Multiple contacts',
      'cue-1' as CueId,
    );

    expect(result.mergedGroup.eoTrackIds).toContain(track1.eoTrackId);
    expect(result.mergedGroup.eoTrackIds).toContain(track2.eoTrackId);
    expect(result.mergedGroup.eoTrackIds).toContain(track3.eoTrackId);
    expect(result.mergedGroup.eoTrackIds).toHaveLength(3);
  });

  it('should set resolutionEvent to undefined on creation', () => {
    const track = makeEoTrack();

    const result = mergeIntoGroup(
      [track],
      'Single ambiguous',
      'cue-1' as CueId,
    );

    expect(result.mergedGroup.resolutionEvent).toBeUndefined();
  });
});
