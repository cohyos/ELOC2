import { describe, it, expect, beforeEach } from 'vitest';
import { assertGeometryHonesty } from '../src/assertions/geometry-honesty.js';
import { makeGeometryEstimateUpdated, resetCounter } from './helpers.js';

describe('assertGeometryHonesty', () => {
  beforeEach(() => resetCounter());

  it('passes when no weak estimates claim confirmed_3d', () => {
    const events = [
      makeGeometryEstimateUpdated({ quality: 'strong', classification: 'confirmed_3d' }),
      makeGeometryEstimateUpdated({ quality: 'acceptable', classification: 'candidate_3d' }),
      makeGeometryEstimateUpdated({ quality: 'weak', classification: 'bearing_only' }),
    ];

    const result = assertGeometryHonesty(events);
    expect(result.passed).toBe(true);
    expect(result.totalEstimates).toBe(3);
    expect(result.dishonestEstimates).toBe(0);
  });

  it('fails when a weak estimate claims confirmed_3d', () => {
    const events = [
      makeGeometryEstimateUpdated({ quality: 'weak', classification: 'confirmed_3d' }),
    ];

    const result = assertGeometryHonesty(events);
    expect(result.passed).toBe(false);
    expect(result.dishonestEstimates).toBe(1);
  });

  it('fails when an insufficient estimate claims confirmed_3d', () => {
    const events = [
      makeGeometryEstimateUpdated({ quality: 'insufficient', classification: 'confirmed_3d' }),
    ];

    const result = assertGeometryHonesty(events);
    expect(result.passed).toBe(false);
    expect(result.dishonestEstimates).toBe(1);
  });

  it('allows weak estimates with bearing_only or candidate_3d', () => {
    const events = [
      makeGeometryEstimateUpdated({ quality: 'weak', classification: 'bearing_only' }),
      makeGeometryEstimateUpdated({ quality: 'insufficient', classification: 'candidate_3d' }),
    ];

    const result = assertGeometryHonesty(events);
    expect(result.passed).toBe(true);
    expect(result.dishonestEstimates).toBe(0);
  });

  it('fails when no geometry events exist', () => {
    const result = assertGeometryHonesty([]);
    expect(result.passed).toBe(false);
    expect(result.totalEstimates).toBe(0);
  });

  it('counts multiple dishonest estimates', () => {
    const events = [
      makeGeometryEstimateUpdated({ estimateId: 'g1', quality: 'weak', classification: 'confirmed_3d' }),
      makeGeometryEstimateUpdated({ estimateId: 'g2', quality: 'insufficient', classification: 'confirmed_3d' }),
      makeGeometryEstimateUpdated({ estimateId: 'g3', quality: 'strong', classification: 'confirmed_3d' }),
    ];

    const result = assertGeometryHonesty(events);
    expect(result.passed).toBe(false);
    expect(result.dishonestEstimates).toBe(2);
    expect(result.totalEstimates).toBe(3);
  });
});
