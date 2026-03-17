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
import { splitGroup, clusterBearings } from '../split-merge/splitter.js';

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

// ---------------------------------------------------------------------------
// Adaptive threshold tests
// ---------------------------------------------------------------------------

describe('clusterBearings — adaptive threshold', () => {
  it('should use default base threshold (0.5) when no options given (backward compatible)', () => {
    // 0.4 deg apart — should be one cluster with default threshold 0.5
    const bearings = [makeBearing(45.0), makeBearing(45.4)];
    const clusters = clusterBearings(bearings);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('should equal base threshold when avgBearingNoise = 0', () => {
    // 0.6 deg apart — exceeds 0.5 base threshold, should split
    const bearings = [makeBearing(45.0), makeBearing(45.6)];
    const clusters = clusterBearings(bearings, { avgBearingNoise: 0 });
    expect(clusters).toHaveLength(2);
  });

  it('should widen threshold when avgBearingNoise is high (noise=1.0 doubles threshold)', () => {
    // With noise=0.5, threshold = 0.5 * (1 + 0.5/0.5) = 1.0
    // 0.8 deg apart — would split with default but not with noise=0.5
    const bearings = [makeBearing(45.0), makeBearing(45.8)];

    // Default: should split (0.8 > 0.5)
    const defaultClusters = clusterBearings(bearings);
    expect(defaultClusters).toHaveLength(2);

    // With noise=0.5: threshold = 1.0, so 0.8 < 1.0 — same cluster
    const noisyClusters = clusterBearings(bearings, { avgBearingNoise: 0.5 });
    expect(noisyClusters).toHaveLength(1);
  });

  it('should double threshold when avgBearingNoise = 0.5', () => {
    // threshold = 0.5 * (1 + 0.5/0.5) = 1.0
    const bearings = [makeBearing(45.0), makeBearing(45.9)];
    const clusters = clusterBearings(bearings, { avgBearingNoise: 0.5 });
    expect(clusters).toHaveLength(1); // 0.9 < 1.0
  });

  it('should triple threshold when avgBearingNoise = 1.0', () => {
    // threshold = 0.5 * (1 + 1.0/0.5) = 0.5 * 3 = 1.5
    const bearings = [makeBearing(45.0), makeBearing(46.4)];
    const clusters = clusterBearings(bearings, { avgBearingNoise: 1.0 });
    expect(clusters).toHaveLength(1); // 1.4 < 1.5
  });

  it('should allow custom base threshold', () => {
    // baseThreshold = 1.0, no noise → threshold = 1.0
    const bearings = [makeBearing(45.0), makeBearing(45.8)];
    const clusters = clusterBearings(bearings, { baseThreshold: 1.0 });
    expect(clusters).toHaveLength(1); // 0.8 < 1.0
  });
});
