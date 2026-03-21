import { describe, it, expect } from 'vitest';
import type {
  SystemTrack,
  SystemTrackId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import {
  computeRevisitPriority,
  scheduleRevisits,
  DEFAULT_REVISIT_CONFIG,
} from '../scheduler/revisit-scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTrack(overrides: Partial<SystemTrack> = {}): SystemTrack {
  return {
    systemTrackId: 'track-1' as SystemTrackId,
    state: { lat: 32.0, lon: 34.0, alt: 5000 },
    velocity: { vx: 100, vy: 50, vz: 0 },
    covariance: [
      [100, 0,   0  ],
      [0,   100, 0  ],
      [0,   0,   100],
    ],
    confidence: 0.8,
    status: 'confirmed',
    lineage: [],
    lastUpdated: Date.now() as Timestamp,
    sources: ['sensor-1' as SensorId],
    eoInvestigationStatus: 'none',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRevisitPriority', () => {
  it('high-threat (missile) track gets higher priority than civilian track', () => {
    const missile = mockTrack({ classification: 'missile' });
    const civilian = mockTrack({ classification: 'civilian_aircraft' });

    const pMissile = computeRevisitPriority(missile);
    const pCivilian = computeRevisitPriority(civilian);

    expect(pMissile.priority).toBeGreaterThan(pCivilian.priority);
  });

  it('coasting track gets higher priority than confirmed track', () => {
    const coasting = mockTrack({ status: 'coasting' });
    const confirmed = mockTrack({ status: 'confirmed' });

    const pCoasting = computeRevisitPriority(coasting);
    const pConfirmed = computeRevisitPriority(confirmed);

    expect(pCoasting.priority).toBeGreaterThan(pConfirmed.priority);
  });

  it('computeRevisitPriority returns bounded values in [0, 1]', () => {
    const tracks = [
      mockTrack({ status: 'confirmed', classification: 'missile' }),
      mockTrack({ status: 'coasting', classification: 'civilian_aircraft' }),
      mockTrack({ status: 'tentative', classification: 'unknown' }),
    ];

    for (const track of tracks) {
      const result = computeRevisitPriority(track);
      expect(result.priority).toBeGreaterThanOrEqual(0);
      expect(result.priority).toBeLessThanOrEqual(1);
    }
  });

  it('returns a valid RevisitPriority structure', () => {
    const track = mockTrack();
    const result = computeRevisitPriority(track);

    expect(result.trackId).toBe('track-1');
    expect(typeof result.priority).toBe('number');
    expect(typeof result.plannedNextUpdateTime).toBe('number');
    expect(typeof result.covarianceGrowthRate).toBe('number');
    expect(typeof result.beamCost).toBe('number');
  });

  it('high covariance leads to higher covariance growth rate', () => {
    const lowCov = mockTrack({
      covariance: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
    });
    const highCov = mockTrack({
      covariance: [[5000, 0, 0], [0, 5000, 0], [0, 0, 5000]],
    });

    const pLow = computeRevisitPriority(lowCov);
    const pHigh = computeRevisitPriority(highCov);

    expect(pHigh.covarianceGrowthRate).toBeGreaterThan(pLow.covarianceGrowthRate);
  });
});

describe('scheduleRevisits', () => {
  it('scheduleRevisits returns non-empty schedule for a list of tracks', () => {
    const tracks = [
      mockTrack({ systemTrackId: 'track-1' as SystemTrackId }),
      mockTrack({ systemTrackId: 'track-2' as SystemTrackId }),
      mockTrack({ systemTrackId: 'track-3' as SystemTrackId }),
    ];

    const schedule = scheduleRevisits(tracks);

    expect(schedule).toHaveLength(3);
    for (const entry of schedule) {
      expect(entry.revisitIntervalMs).toBeGreaterThan(0);
      expect(entry.nextUpdateTime).toBeGreaterThan(0);
      expect(typeof entry.trackId).toBe('string');
    }
  });

  it('returns empty schedule for an empty track list', () => {
    const schedule = scheduleRevisits([]);
    expect(schedule).toHaveLength(0);
  });

  it('revisit intervals are within configured min/max bounds', () => {
    const tracks = [
      mockTrack({ systemTrackId: 'track-1' as SystemTrackId, classification: 'missile' }),
      mockTrack({ systemTrackId: 'track-2' as SystemTrackId, classification: 'civilian_aircraft' }),
    ];

    const schedule = scheduleRevisits(tracks, 10000, DEFAULT_REVISIT_CONFIG);

    for (const entry of schedule) {
      expect(entry.revisitIntervalMs).toBeGreaterThanOrEqual(DEFAULT_REVISIT_CONFIG.minRevisitMs);
      expect(entry.revisitIntervalMs).toBeLessThanOrEqual(DEFAULT_REVISIT_CONFIG.maxRevisitMs);
    }
  });

  it('single track gets a valid schedule entry', () => {
    const tracks = [mockTrack()];
    const schedule = scheduleRevisits(tracks);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].revisitIntervalMs).toBeGreaterThan(0);
  });
});
