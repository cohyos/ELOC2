import { describe, it, expect } from 'vitest';
import { generateRadarObservation } from '../src/sensors/radar/radar-model.js';
import type { SensorDefinition, FaultDefinition } from '../src/types/scenario.js';
import type { Position3D, Velocity3D } from '@eloc2/domain';

const sensor: SensorDefinition = {
  sensorId: 'radar-1',
  type: 'radar',
  position: { lat: 34.0, lon: -118.0, alt: 0 },
  coverage: {
    minAzDeg: 0,
    maxAzDeg: 360,
    minElDeg: -5,
    maxElDeg: 90,
    maxRangeM: 200_000,
  },
};

const targetPos: Position3D = { lat: 34.05, lon: -117.95, alt: 5000 };
const targetVel: Velocity3D = { vx: 100, vy: 50, vz: 0 };

describe('generateRadarObservation', () => {
  it('generates an observation for a target in coverage', () => {
    const obs = generateRadarObservation(
      sensor, targetPos, targetVel, 10, 1_000_000, [],
    );
    expect(obs).toBeDefined();
    expect(obs!.sensorId).toBe('radar-1');
    expect(obs!.observation.sensorFrame).toBe('radar');
    expect(obs!.observation.position).toBeDefined();
    expect(obs!.observation.velocity).toBeDefined();
    expect(obs!.observation.covariance).toHaveLength(3);
  });

  it('adds noise to position', () => {
    // Run multiple times; at least one should differ from truth
    const results = Array.from({ length: 10 }, () =>
      generateRadarObservation(sensor, targetPos, targetVel, 10, 1_000_000, []),
    );
    const lats = results.filter(Boolean).map((r) => r!.observation.position.lat);
    // Not all identical to truth
    const allExact = lats.every((l) => l === targetPos.lat);
    expect(allExact).toBe(false);
  });

  it('returns undefined when target is out of range', () => {
    const farTarget: Position3D = { lat: 36.0, lon: -115.0, alt: 5000 };
    const obs = generateRadarObservation(
      sensor, farTarget, targetVel, 10, 1_000_000, [],
    );
    expect(obs).toBeUndefined();
  });

  it('returns undefined when sensor is in outage', () => {
    const faults: FaultDefinition[] = [
      { type: 'sensor_outage', sensorId: 'radar-1', startTime: 0 },
    ];
    const obs = generateRadarObservation(
      sensor, targetPos, targetVel, 10, 1_000_000, faults,
    );
    expect(obs).toBeUndefined();
  });

  it('applies azimuth bias fault', () => {
    const faults: FaultDefinition[] = [
      { type: 'azimuth_bias', sensorId: 'radar-1', startTime: 0, magnitude: 5 },
    ];
    // Generate many observations with and without bias
    const withBias = Array.from({ length: 20 }, () =>
      generateRadarObservation(sensor, targetPos, targetVel, 10, 1_000_000, faults),
    ).filter(Boolean);

    const withoutBias = Array.from({ length: 20 }, () =>
      generateRadarObservation(sensor, targetPos, targetVel, 10, 1_000_000, []),
    ).filter(Boolean);

    // Average positions should differ due to bias
    const avgLonBias = withBias.reduce((s, r) => s + r!.observation.position.lon, 0) / withBias.length;
    const avgLonNoBias = withoutBias.reduce((s, r) => s + r!.observation.position.lon, 0) / withoutBias.length;
    // Just check they're different (bias shifts position)
    expect(avgLonBias).not.toBeCloseTo(avgLonNoBias, 4);
  });

  it('applies clock drift fault', () => {
    const faults: FaultDefinition[] = [
      { type: 'clock_drift', sensorId: 'radar-1', startTime: 0, magnitude: 500 },
    ];
    const obs = generateRadarObservation(
      sensor, targetPos, targetVel, 10, 1_000_000, faults,
    );
    expect(obs).toBeDefined();
    // Timestamp should include drift: base + timeSec*1000 + drift = 1_000_000 + 10_000 + 500
    expect(obs!.observation.timestamp).toBe(1_010_500);
  });

  it('handles undefined velocity gracefully', () => {
    const obs = generateRadarObservation(
      sensor, targetPos, undefined, 10, 1_000_000, [],
    );
    expect(obs).toBeDefined();
    expect(obs!.observation.velocity).toBeUndefined();
  });

  it('returns observation with valid covariance matrix', () => {
    const obs = generateRadarObservation(
      sensor, targetPos, targetVel, 10, 1_000_000, [],
    );
    expect(obs).toBeDefined();
    const cov = obs!.observation.covariance;
    expect(cov).toHaveLength(3);
    for (const row of cov) {
      expect(row).toHaveLength(3);
    }
    // Diagonal should be positive
    expect(cov[0][0]).toBeGreaterThan(0);
    expect(cov[1][1]).toBeGreaterThan(0);
    expect(cov[2][2]).toBeGreaterThan(0);
    // Off-diagonal should be zero
    expect(cov[0][1]).toBe(0);
  });
});
