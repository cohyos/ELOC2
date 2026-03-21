import { describe, it, expect } from 'vitest';
import { createDefaultTrackQuality } from '../track-quality.js';
import type { TrackQuality, MotionModelStatus, DetectionQualityFlags, BeamMetadata, ClassificationHypothesis } from '../track-quality.js';

describe('TrackQuality', () => {
  describe('createDefaultTrackQuality', () => {
    it('returns a valid TrackQuality with conservative defaults', () => {
      const tq = createDefaultTrackQuality();

      expect(tq.existenceProbability).toBe(0.3);
      expect(tq.kinematicConfidence).toBe(0.5);
      expect(tq.lastReliableUpdateAge).toBe(0);
      expect(tq.rollingSupportCount).toBe(1);
      expect(tq.sourceDiversity).toBe(1);
      expect(tq.motionModelConfidence).toBe(0.5);
      expect(tq.sectorClutterStress).toBe(0);
    });

    it('returns all values within expected ranges', () => {
      const tq = createDefaultTrackQuality();

      expect(tq.existenceProbability).toBeGreaterThanOrEqual(0);
      expect(tq.existenceProbability).toBeLessThanOrEqual(1);
      expect(tq.kinematicConfidence).toBeGreaterThanOrEqual(0);
      expect(tq.kinematicConfidence).toBeLessThanOrEqual(1);
      expect(tq.motionModelConfidence).toBeGreaterThanOrEqual(0);
      expect(tq.motionModelConfidence).toBeLessThanOrEqual(1);
      expect(tq.sectorClutterStress).toBeGreaterThanOrEqual(0);
      expect(tq.sectorClutterStress).toBeLessThanOrEqual(1);
      expect(tq.lastReliableUpdateAge).toBeGreaterThanOrEqual(0);
      expect(tq.rollingSupportCount).toBeGreaterThanOrEqual(0);
      expect(tq.sourceDiversity).toBeGreaterThanOrEqual(0);
    });

    it('returns a new object each time (no shared state)', () => {
      const tq1 = createDefaultTrackQuality();
      const tq2 = createDefaultTrackQuality();

      expect(tq1).not.toBe(tq2);
      expect(tq1).toEqual(tq2);
    });
  });

  describe('MotionModelStatus type', () => {
    it('accepts valid motion model values', () => {
      const models: MotionModelStatus[] = [
        'constant_velocity',
        'coordinated_turn',
        'ballistic',
        'unknown',
      ];
      expect(models).toHaveLength(4);
    });
  });

  describe('DetectionQualityFlags type', () => {
    it('accepts a full set of quality flags', () => {
      const flags: DetectionQualityFlags = {
        clutterContaminated: false,
        ecmDetected: true,
        multipath: false,
        lowSnr: true,
      };
      expect(flags.ecmDetected).toBe(true);
      expect(flags.lowSnr).toBe(true);
    });
  });

  describe('BeamMetadata type', () => {
    it('accepts beam metadata with all optional fields', () => {
      const meta: BeamMetadata = {
        beamId: 'beam-42',
        dwellTimeMs: 20,
        pulseCount: 64,
      };
      expect(meta.beamId).toBe('beam-42');
    });

    it('accepts beam metadata with no fields', () => {
      const meta: BeamMetadata = {};
      expect(meta.beamId).toBeUndefined();
    });
  });

  describe('ClassificationHypothesis type', () => {
    it('holds classification label and probability', () => {
      const hyps: ClassificationHypothesis[] = [
        { label: 'fighter_aircraft', probability: 0.7 },
        { label: 'uav', probability: 0.2 },
        { label: 'unknown', probability: 0.1 },
      ];
      const total = hyps.reduce((s, h) => s + h.probability, 0);
      expect(total).toBeCloseTo(1.0);
    });
  });
});
