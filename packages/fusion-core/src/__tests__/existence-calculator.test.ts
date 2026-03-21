import { describe, it, expect } from 'vitest';
import {
  updateExistenceOnDetection,
  updateExistenceOnMiss,
  computeTrackQuality,
  type TrackMetaForQuality,
} from '../track-management/existence-calculator.js';

describe('updateExistenceOnDetection', () => {
  it('should increase existence probability on detection', () => {
    const initial = 0.5;
    const updated = updateExistenceOnDetection(initial, 0.9, 0.01);
    expect(updated).toBeGreaterThan(initial);
    expect(updated).toBeGreaterThanOrEqual(0);
    expect(updated).toBeLessThanOrEqual(1);
  });

  it('should return near 0 when Pe is 0', () => {
    // numerator = pd * 0 = 0; denominator = pfa * (1 - 0) = pfa
    const updated = updateExistenceOnDetection(0, 0.9, 0.01);
    expect(updated).toBeCloseTo(0, 5);
  });

  it('should stay at 1 when Pe is 1', () => {
    // numerator = pd * 1 = pd; denominator = pd * 1 + pfa * 0 = pd; result = 1
    const updated = updateExistenceOnDetection(1, 0.9, 0.01);
    expect(updated).toBeCloseTo(1, 5);
  });

  it('should increase more with higher detection probability', () => {
    const low = updateExistenceOnDetection(0.5, 0.5, 0.01);
    const high = updateExistenceOnDetection(0.5, 0.95, 0.01);
    expect(high).toBeGreaterThan(low);
  });

  it('result is always in [0, 1]', () => {
    const cases: [number, number, number][] = [
      [0.1, 0.8, 0.05],
      [0.9, 0.95, 0.001],
      [0.5, 0.7, 0.1],
    ];
    for (const [pe, pd, pfa] of cases) {
      const result = updateExistenceOnDetection(pe, pd, pfa);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe('updateExistenceOnMiss', () => {
  it('should decrease existence probability on miss', () => {
    const initial = 0.8;
    const updated = updateExistenceOnMiss(initial, 0.9, 0.01);
    expect(updated).toBeLessThan(initial);
    expect(updated).toBeGreaterThanOrEqual(0);
    expect(updated).toBeLessThanOrEqual(1);
  });

  it('should converge toward 0 with repeated misses', () => {
    let pe = 0.9;
    for (let i = 0; i < 20; i++) {
      pe = updateExistenceOnMiss(pe, 0.9, 0.01);
    }
    expect(pe).toBeLessThan(0.1);
  });

  it('should use default pfa when not provided', () => {
    const withDefault = updateExistenceOnMiss(0.5, 0.8);
    const withExplicit = updateExistenceOnMiss(0.5, 0.8, 0.01);
    expect(withDefault).toBeCloseTo(withExplicit, 5);
  });

  it('result is always in [0, 1]', () => {
    const cases: [number, number, number][] = [
      [0.1, 0.8, 0.05],
      [0.9, 0.95, 0.001],
      [0.5, 0.7, 0.1],
    ];
    for (const [pe, pd, pfa] of cases) {
      const result = updateExistenceOnMiss(pe, pd, pfa);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTrackQuality', () => {
  it('returns a valid TrackQuality with correct fields', () => {
    const meta: TrackMetaForQuality = {
      updateCount: 10,
      missCount: 1,
      existenceProbability: 0.85,
      rollingSupportWindow: [true, true, false, true, true],
      sourceDiversity: 2,
      motionModelConfidence: 0.9,
      lastReliableUpdateAge: 500,
      sectorClutterStress: 0.2,
    };
    const quality = computeTrackQuality(meta);

    expect(quality.existenceProbability).toBe(0.85);
    expect(quality.kinematicConfidence).toBeGreaterThanOrEqual(0);
    expect(quality.kinematicConfidence).toBeLessThanOrEqual(1);
    // 4 trues out of 5
    expect(quality.rollingSupportCount).toBe(4);
    expect(quality.sourceDiversity).toBe(2);
    expect(quality.motionModelConfidence).toBe(0.9);
    expect(quality.lastReliableUpdateAge).toBe(500);
    expect(quality.sectorClutterStress).toBe(0.2);
  });

  it('kinematicConfidence equals fraction of support hits', () => {
    const meta: TrackMetaForQuality = {
      updateCount: 8,
      missCount: 0,
      existenceProbability: 0.7,
      rollingSupportWindow: [true, false, true, false, true, false, true, false],
      sourceDiversity: 1,
      motionModelConfidence: 0.5,
      lastReliableUpdateAge: 100,
      sectorClutterStress: 0,
    };
    const quality = computeTrackQuality(meta);
    expect(quality.kinematicConfidence).toBeCloseTo(0.5, 5);
  });

  it('handles empty rollingSupportWindow without error', () => {
    const meta: TrackMetaForQuality = {
      updateCount: 0,
      missCount: 0,
      existenceProbability: 0.5,
      rollingSupportWindow: [],
      sourceDiversity: 0,
      motionModelConfidence: 0,
      lastReliableUpdateAge: 0,
      sectorClutterStress: 0,
    };
    const quality = computeTrackQuality(meta);
    expect(quality.rollingSupportCount).toBe(0);
    expect(quality.kinematicConfidence).toBe(0);
  });
});
