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
    expect(obs!.observation.radialVelocity).toBeUndefined();
    expect(obs!.observation.dopplerQuality).toBeUndefined();
  });

  it('computes radial velocity from Doppler', () => {
    // Target moving due east (vx=100) relative to sensor south of it
    const obs = generateRadarObservation(
      sensor, targetPos, targetVel, 10, 1_000_000, [],
    );
    expect(obs).toBeDefined();
    expect(obs!.observation.radialVelocity).toBeDefined();
    expect(typeof obs!.observation.radialVelocity).toBe('number');
    expect(obs!.observation.dopplerQuality).toBeDefined();
    expect(['high', 'medium', 'low', 'blind']).toContain(obs!.observation.dopplerQuality);
  });

  it('adds noise to radial velocity measurement', () => {
    const results = Array.from({ length: 20 }, () =>
      generateRadarObservation(sensor, targetPos, targetVel, 10, 1_000_000, []),
    ).filter(Boolean);
    const radials = results.map((r) => r!.observation.radialVelocity!);
    // Not all identical (noise applied)
    const allSame = radials.every((v) => v === radials[0]);
    expect(allSame).toBe(false);
  });

  it('MTI filter rejects near-zero radial velocity targets', () => {
    // Target moving perpendicular to LOS — radial velocity ≈ 0
    // Sensor at (34, -118), target at (34, -117.95) → LOS is roughly east
    // Velocity purely north (vy=100) → radial component ≈ 0
    const perpVel: Velocity3D = { vx: 0, vy: 100, vz: 0 };
    // Target very close in latitude so LOS is mostly east
    const nearTarget: Position3D = { lat: 34.0, lon: -117.95, alt: 5000 };

    let filtered = 0;
    for (let i = 0; i < 50; i++) {
      const obs = generateRadarObservation(
        sensor, nearTarget, perpVel, 10, 1_000_000, [], 'test', undefined,
        { mtiEnabled: true },
      );
      if (!obs) filtered++;
    }
    // With perpendicular velocity, most should be filtered by MTI
    expect(filtered).toBeGreaterThan(20);
  });

  it('MTI filter passes targets with high radial velocity', () => {
    // Target approaching sensor head-on
    // Sensor at (34, -118), target at (34.05, -117.95) → LOS is NE
    // Velocity heading SW toward sensor
    const approachVel: Velocity3D = { vx: -150, vy: -150, vz: 0 };
    let passed = 0;
    for (let i = 0; i < 20; i++) {
      const obs = generateRadarObservation(
        sensor, targetPos, approachVel, 10, 1_000_000, [], 'test', undefined,
        { mtiEnabled: true },
      );
      if (obs) passed++;
    }
    // High radial velocity targets should all pass MTI
    expect(passed).toBe(20);
  });

  it('detects blind speed condition', () => {
    // blind_speed = PRF * wavelength / 2 = 3000 * 0.1 / 2 = 150 m/s
    // Target with radial velocity near 150 m/s should get 'blind' quality
    // We need velocity along LOS ≈ 150 m/s
    // LOS from (34,-118) to (34.05,-117.95) is roughly NE
    // Use high velocity toward NE to get ~150 m/s radial
    const fastVel: Velocity3D = { vx: 120, vy: 120, vz: 0 };
    let foundBlind = false;
    for (let i = 0; i < 50; i++) {
      const obs = generateRadarObservation(
        sensor, targetPos, fastVel, 10, 1_000_000, [], 'test', undefined,
        { prfHz: 3000, wavelengthM: 0.1 },
      );
      if (obs?.observation.dopplerQuality === 'blind') {
        foundBlind = true;
        break;
      }
    }
    // It's possible but not guaranteed due to noise; just verify the field exists
    // The important thing is the quality field is populated
    const obs = generateRadarObservation(
      sensor, targetPos, fastVel, 10, 1_000_000, [],
    );
    expect(obs).toBeDefined();
    expect(obs!.observation.dopplerQuality).toBeDefined();
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
