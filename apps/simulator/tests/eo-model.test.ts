import { describe, it, expect } from 'vitest';
import { generateEoBearing } from '../src/sensors/eo/eo-model.js';
import type { SensorDefinition, FaultDefinition } from '../src/types/scenario.js';
import type { Position3D } from '@eloc2/domain';

const sensor: SensorDefinition = {
  sensorId: 'eo-1',
  type: 'eo',
  position: { lat: 34.0, lon: -118.0, alt: 0 },
  coverage: {
    minAzDeg: 0,
    maxAzDeg: 360,
    minElDeg: -5,
    maxElDeg: 90,
    maxRangeM: 100_000,
  },
};

const targetPos: Position3D = { lat: 34.05, lon: -117.95, alt: 5000 };

describe('generateEoBearing', () => {
  it('generates a bearing observation for a target in coverage', () => {
    const obs = generateEoBearing(sensor, targetPos, 10, 1_000_000, []);
    expect(obs).toBeDefined();
    expect(obs!.sensorId).toBe('eo-1');
    expect(obs!.bearing.sensorId).toBe('eo-1');
    expect(obs!.bearing.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(obs!.bearing.azimuthDeg).toBeLessThan(360);
    expect(obs!.imageQuality).toBeGreaterThanOrEqual(0.8);
    expect(obs!.imageQuality).toBeLessThanOrEqual(1.0);
  });

  it('adds noise to bearing', () => {
    const results = Array.from({ length: 20 }, () =>
      generateEoBearing(sensor, targetPos, 10, 1_000_000, []),
    );
    const azimuths = results.filter(Boolean).map((r) => r!.bearing.azimuthDeg);
    // Not all identical
    const allSame = azimuths.every((a) => a === azimuths[0]);
    expect(allSame).toBe(false);
  });

  it('returns undefined when target is out of range', () => {
    const farTarget: Position3D = { lat: 36.0, lon: -115.0, alt: 5000 };
    const obs = generateEoBearing(sensor, farTarget, 10, 1_000_000, []);
    expect(obs).toBeUndefined();
  });

  it('returns undefined when sensor is in outage', () => {
    const faults: FaultDefinition[] = [
      { type: 'sensor_outage', sensorId: 'eo-1', startTime: 0 },
    ];
    const obs = generateEoBearing(sensor, targetPos, 10, 1_000_000, faults);
    expect(obs).toBeUndefined();
  });

  it('applies azimuth bias', () => {
    const faults: FaultDefinition[] = [
      { type: 'azimuth_bias', sensorId: 'eo-1', startTime: 0, magnitude: 10 },
    ];
    const withBias = Array.from({ length: 20 }, () =>
      generateEoBearing(sensor, targetPos, 10, 1_000_000, faults),
    ).filter(Boolean);

    const withoutBias = Array.from({ length: 20 }, () =>
      generateEoBearing(sensor, targetPos, 10, 1_000_000, []),
    ).filter(Boolean);

    const avgAzBias = withBias.reduce((s, r) => s + r!.bearing.azimuthDeg, 0) / withBias.length;
    const avgAzNoBias = withoutBias.reduce((s, r) => s + r!.bearing.azimuthDeg, 0) / withoutBias.length;

    // The difference should be approximately the bias magnitude (10 degrees)
    expect(Math.abs(avgAzBias - avgAzNoBias)).toBeGreaterThan(5);
  });

  it('applies clock drift to timestamp', () => {
    const faults: FaultDefinition[] = [
      { type: 'clock_drift', sensorId: 'eo-1', startTime: 0, magnitude: 300 },
    ];
    const obs = generateEoBearing(sensor, targetPos, 10, 1_000_000, faults);
    expect(obs).toBeDefined();
    // base + time*1000 + drift = 1_000_000 + 10_000 + 300
    expect(obs!.bearing.timestamp).toBe(1_010_300);
  });

  it('produces elevation that reflects altitude difference', () => {
    const obs = generateEoBearing(sensor, targetPos, 10, 1_000_000, []);
    expect(obs).toBeDefined();
    // Target is above sensor, so elevation should be positive
    expect(obs!.bearing.elevationDeg).toBeGreaterThan(0);
  });
});
