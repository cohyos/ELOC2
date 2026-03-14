import { describe, it, expect, beforeEach } from 'vitest';
import { assertTrackContinuity } from '../src/assertions/track-continuity.js';
import { makeSystemTrackUpdated, resetCounter } from './helpers.js';

describe('assertTrackContinuity', () => {
  beforeEach(() => resetCounter());

  it('passes when track count matches and no drops or switches', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5 }),
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.1 }),
      makeSystemTrackUpdated({ systemTrackId: 'T2', sourcesUsed: ['S2'], confidenceChange: 0.5 }),
    ];

    const result = assertTrackContinuity(events, 2);
    expect(result.passed).toBe(true);
    expect(result.trackCount).toBe(2);
    expect(result.spuriousDrops).toBe(0);
    expect(result.idSwitches).toBe(0);
  });

  it('fails when track count does not match expected', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'] }),
    ];

    const result = assertTrackContinuity(events, 3);
    expect(result.passed).toBe(false);
    expect(result.trackCount).toBe(1);
    expect(result.details).toContain('Expected 3 tracks, found 1');
  });

  it('detects spurious drops (confirmed -> dropped -> tentative)', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5, timestamp: 1000 }),
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: -0.8, timestamp: 2000 }),
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5, timestamp: 3000 }),
    ];

    const result = assertTrackContinuity(events, 1);
    expect(result.spuriousDrops).toBe(1);
    expect(result.passed).toBe(false);
  });

  it('allows spurious drops up to the configured maximum', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5, timestamp: 1000 }),
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: -0.8, timestamp: 2000 }),
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1'], confidenceChange: 0.5, timestamp: 3000 }),
    ];

    const result = assertTrackContinuity(events, 1, 1);
    expect(result.spuriousDrops).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('detects ID switches (same sources, different track IDs)', () => {
    const events = [
      makeSystemTrackUpdated({ systemTrackId: 'T1', sourcesUsed: ['S1', 'S2'] }),
      makeSystemTrackUpdated({ systemTrackId: 'T2', sourcesUsed: ['S1', 'S2'] }),
    ];

    const result = assertTrackContinuity(events, 2);
    expect(result.idSwitches).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('handles empty event stream', () => {
    const result = assertTrackContinuity([], 0);
    expect(result.passed).toBe(true);
    expect(result.trackCount).toBe(0);
  });
});
