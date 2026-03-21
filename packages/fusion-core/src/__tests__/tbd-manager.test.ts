import { describe, it, expect } from 'vitest';
import type {
  SourceObservation,
  SensorId,
  Timestamp,
} from '@eloc2/domain';
import { TBDManager } from '../tbd/tbd-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockObs(id: string, lat: number, lon: number, alt = 1000): SourceObservation {
  return {
    observationId: id,
    sensorId: 'sensor-1' as SensorId,
    timestamp: Date.now() as Timestamp,
    position: { lat, lon, alt },
    velocity: undefined,
    covariance: [
      [100, 0,   0  ],
      [0,   100, 0  ],
      [0,   0,   100],
    ],
    sensorFrame: 'radar',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TBDManager', () => {
  describe('candidate creation', () => {
    it('creates a candidate from the first observation', () => {
      const mgr = new TBDManager();
      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);

      expect(mgr.candidates.size).toBe(1);

      const candidate = [...mgr.candidates.values()][0];
      expect(candidate.hitCount).toBe(1);
      expect(candidate.observations).toHaveLength(1);
    });

    it('creates a separate candidate for each spatially distinct observation', () => {
      const mgr = new TBDManager({ associationRadiusM: 1000 });

      // Two observations far apart
      mgr.ingestUnassociatedObservations([
        mockObs('obs-1', 32.0, 34.0),
        mockObs('obs-2', 33.0, 35.0), // ~150 km away
      ]);

      expect(mgr.candidates.size).toBe(2);
    });
  });

  describe('candidate promotion', () => {
    it('candidate is promoted when LLR exceeds threshold after enough hits', () => {
      // 3 hits × 1.5 LLR/hit = 4.5, which exceeds threshold of 4.0
      const mgr = new TBDManager({
        initiationLLRThreshold: 4.0,
        hitLLR: 1.5,
        associationRadiusM: 50_000,
      });

      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);
      mgr.ingestUnassociatedObservations([mockObs('obs-2', 32.0001, 34.0001)]);
      mgr.ingestUnassociatedObservations([mockObs('obs-3', 32.0002, 34.0002)]);

      const { promoted } = mgr.tick();

      expect(promoted).toHaveLength(1);
      expect(promoted[0].status).toBe('tentative');
      // Candidate removed after promotion
      expect(mgr.candidates.size).toBe(0);
    });

    it('promoted track has moderate confidence', () => {
      const mgr = new TBDManager({
        initiationLLRThreshold: 3.0,
        hitLLR: 1.5,
        associationRadiusM: 50_000,
      });

      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);
      mgr.ingestUnassociatedObservations([mockObs('obs-2', 32.0001, 34.0001)]);
      mgr.ingestUnassociatedObservations([mockObs('obs-3', 32.0002, 34.0002)]);

      const { promoted } = mgr.tick();

      expect(promoted[0].confidence).toBeGreaterThan(0);
      expect(promoted[0].confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('candidate pruning', () => {
    it('candidate is pruned when LLR drops below deletion threshold', () => {
      // Start with one hit (LLR = 1.5), then apply 3 misses (-1.5 each)
      // After misses: 1.5 - 1.5*3 = -3.0, below threshold of -2.0
      const mgr = new TBDManager({
        deletionLLRThreshold: -2.0,
        hitLLR: 1.5,
        missLLR: -1.5,
      });

      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);

      // Three consecutive misses
      mgr.applyMisses(new Set());
      mgr.applyMisses(new Set());
      mgr.applyMisses(new Set());

      const { pruned } = mgr.tick();

      expect(pruned.length).toBeGreaterThan(0);
      expect(mgr.candidates.size).toBe(0);
    });

    it('candidate is aged out after max time', () => {
      // Use a negative max age so that any non-negative ageSec satisfies the condition
      const mgr = new TBDManager({
        maxCandidateAgeSec: -1,
      });

      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);

      const { pruned } = mgr.tick();

      expect(pruned.length).toBeGreaterThan(0);
      expect(mgr.candidates.size).toBe(0);
    });
  });

  describe('applyMisses', () => {
    it('decreases cumulative LLR for candidates not in the updated set', () => {
      const mgr = new TBDManager({ missLLR: -1.0, hitLLR: 2.0 });
      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);

      const candidateId = [...mgr.candidates.keys()][0];
      const llrBefore = mgr.candidates.get(candidateId)!.cumulativeLLR;

      // Not in updated set → miss applied
      mgr.applyMisses(new Set());

      const llrAfter = mgr.candidates.get(candidateId)!.cumulativeLLR;
      expect(llrAfter).toBeLessThan(llrBefore);
    });

    it('does not apply miss to candidate that received an observation this scan', () => {
      const mgr = new TBDManager({ missLLR: -1.0, hitLLR: 2.0 });
      mgr.ingestUnassociatedObservations([mockObs('obs-1', 32.0, 34.0)]);

      const candidateId = [...mgr.candidates.keys()][0];
      const llrBefore = mgr.candidates.get(candidateId)!.cumulativeLLR;

      // Candidate ID is in the updated set → no miss
      mgr.applyMisses(new Set([candidateId]));

      const llrAfter = mgr.candidates.get(candidateId)!.cumulativeLLR;
      expect(llrAfter).toBe(llrBefore);
    });
  });
});
