import { describe, it, expect } from 'vitest';
import type { SensorId, Timestamp, Position3D } from '@eloc2/domain';
import { estimateBias } from '../bias-estimator.js';
import type { TrackPair } from '../bias-estimator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePair(
  pos1: Position3D,
  pos2: Position3D,
  sensor1 = 'radar-1' as SensorId,
  sensor2 = 'radar-2' as SensorId,
): TrackPair {
  return {
    sensorId1: sensor1,
    sensorId2: sensor2,
    position1: pos1,
    position2: pos2,
    timestamp: Date.now() as Timestamp,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('estimateBias', () => {
  it('should return zero bias when positions are identical', () => {
    const pos: Position3D = { lat: 32.0, lon: 34.0, alt: 1000 };
    const pairs: TrackPair[] = [
      makePair(pos, pos),
      makePair(pos, pos),
    ];

    const bias = estimateBias('radar-1' as SensorId, pairs);

    expect(bias.azimuthBiasDeg).toBeCloseTo(0, 5);
    expect(bias.elevationBiasDeg).toBeCloseTo(0, 5);
    expect(bias.rangeBiasM).toBeCloseTo(0, 1);
  });

  it('should detect azimuth bias when positions differ systematically', () => {
    // Sensor 1 consistently sees the target slightly east of sensor 2
    const pairs: TrackPair[] = [
      makePair(
        { lat: 32.0, lon: 34.01, alt: 1000 },
        { lat: 32.0, lon: 34.0, alt: 1000 },
      ),
      makePair(
        { lat: 32.5, lon: 34.51, alt: 1000 },
        { lat: 32.5, lon: 34.5, alt: 1000 },
      ),
    ];

    const bias = estimateBias('radar-1' as SensorId, pairs);

    // The azimuth bias should be non-zero because position1 is consistently
    // to the east of position2.
    expect(Math.abs(bias.azimuthBiasDeg)).toBeGreaterThan(0);
    // Range bias should also be non-zero since positions differ
    expect(bias.rangeBiasM).toBeGreaterThan(0);
  });

  it('should return zero bias for empty pairs', () => {
    const bias = estimateBias('radar-1' as SensorId, []);

    expect(bias.azimuthBiasDeg).toBe(0);
    expect(bias.elevationBiasDeg).toBe(0);
    expect(bias.rangeBiasM).toBe(0);
  });

  it('should handle a single pair', () => {
    const pair = makePair(
      { lat: 32.0, lon: 34.0, alt: 1500 },
      { lat: 32.0, lon: 34.0, alt: 1000 },
    );

    const bias = estimateBias('radar-1' as SensorId, [pair]);

    // Positions differ only in altitude → elevation bias should be non-zero
    expect(Math.abs(bias.elevationBiasDeg)).toBeGreaterThan(0);
    // Range bias accounts for altitude difference
    expect(bias.rangeBiasM).toBeGreaterThan(0);
  });

  it('should detect range bias when positions have consistent distance offset', () => {
    // Sensor 1 consistently sees the target further north
    const pairs: TrackPair[] = [
      makePair(
        { lat: 32.01, lon: 34.0, alt: 1000 },
        { lat: 32.0, lon: 34.0, alt: 1000 },
      ),
      makePair(
        { lat: 33.01, lon: 35.0, alt: 1000 },
        { lat: 33.0, lon: 35.0, alt: 1000 },
      ),
    ];

    const bias = estimateBias('radar-1' as SensorId, pairs);

    // Range bias should be roughly 1.1 km (0.01 deg lat ≈ 1.1 km)
    expect(bias.rangeBiasM).toBeGreaterThan(500);
    expect(bias.rangeBiasM).toBeLessThan(2000);
  });
});
