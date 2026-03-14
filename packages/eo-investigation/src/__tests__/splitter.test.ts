import { describe, it, expect } from 'vitest';
import type {
  BearingMeasurement,
  CueId,
  EoTrack,
  EoTrackId,
  GroupId,
  SensorId,
  Timestamp,
  UnresolvedGroup,
} from '@eloc2/domain';
import { splitGroup } from '../split-merge/splitter.js';

// ---------------------------------------------------------------------------
// Helpers
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

function makeBearing(
  azimuthDeg: number,
  elevationDeg = 10,
): BearingMeasurement {
  return {
    azimuthDeg,
    elevationDeg,
    timestamp: Date.now() as Timestamp,
    sensorId: 'eo-sensor-1' as SensorId,
  };
}

function makeEoTrack(id: string): EoTrack {
  return {
    eoTrackId: id as EoTrackId,
    parentCueId: 'cue-1' as CueId,
    sensorId: 'eo-sensor-1' as SensorId,
    bearing: makeBearing(45),
    imageQuality: 0.7,
    identificationSupport: undefined,
    status: 'tentative',
    lineage: [],
    associatedSystemTrackId: undefined,
    confidence: 0.5,
    lastUpdated: Date.now() as Timestamp,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('splitter', () => {
  it('should split bearings with sufficient angular separation (>0.5 deg)', () => {
    const group = makeGroup(['t-1', 't-2']);
    const bearings = [
      makeBearing(45.0),
      makeBearing(46.0), // 1 degree apart — should separate
    ];
    const tracks = new Map<string, EoTrack>([
      ['t-1', makeEoTrack('t-1')],
      ['t-2', makeEoTrack('t-2')],
    ]);

    const result = splitGroup(group, bearings, tracks);

    expect(result.resolvedTracks).toHaveLength(2);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('should not split bearings that are close together (<= 0.5 deg)', () => {
    const group = makeGroup(['t-1', 't-2']);
    const bearings = [
      makeBearing(45.0),
      makeBearing(45.3), // only 0.3 degrees apart — not separable
    ];
    const tracks = new Map<string, EoTrack>([
      ['t-1', makeEoTrack('t-1')],
      ['t-2', makeEoTrack('t-2')],
    ]);

    const result = splitGroup(group, bearings, tracks);

    expect(result.resolvedTracks).toHaveLength(0);
    expect(result.remainingGroup).toBeDefined();
    expect(result.remainingGroup!.groupId).toBe('group-1');
  });

  it('should preserve lineage in split tracks', () => {
    const group = makeGroup(['t-1', 't-2']);
    const bearings = [
      makeBearing(45.0),
      makeBearing(47.0), // clearly separated
    ];
    const tracks = new Map<string, EoTrack>([
      ['t-1', makeEoTrack('t-1')],
      ['t-2', makeEoTrack('t-2')],
    ]);

    const result = splitGroup(group, bearings, tracks);

    for (const track of result.resolvedTracks) {
      expect(track.lineage).toHaveLength(1);
      expect(track.lineage[0].event).toBe('eo.track.split');
      expect(track.lineage[0].description).toContain('group-1');
    }
  });

  it('should return no split for empty bearings', () => {
    const group = makeGroup(['t-1']);
    const tracks = new Map<string, EoTrack>([
      ['t-1', makeEoTrack('t-1')],
    ]);

    const result = splitGroup(group, [], tracks);

    expect(result.resolvedTracks).toHaveLength(0);
    expect(result.remainingGroup).toBeDefined();
    expect(result.remainingGroup!.groupId).toBe('group-1');
  });

  it('should return no split for empty group', () => {
    const group = makeGroup([]);
    const tracks = new Map<string, EoTrack>();

    const result = splitGroup(group, [makeBearing(45)], tracks);

    expect(result.resolvedTracks).toHaveLength(0);
    expect(result.remainingGroup).toEqual(group);
  });
});
